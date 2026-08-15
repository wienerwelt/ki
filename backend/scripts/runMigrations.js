const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
}

const migrationsDirectory = path.resolve(__dirname, '..', 'migrations');
const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
    };

const pool = new Pool(poolConfig);

// Git kann dieselbe SQL-Datei unter Windows mit CRLF und auf Ubuntu mit LF
// auschecken. Für die Unveränderlichkeitsprüfung zählt der SQL-Inhalt, nicht
// der betriebssystemspezifische Zeilenumbruch.
const normalizeForChecksum = (content) => content.replace(/\r\n?/g, '\n');
const checksum = (content) => crypto
    .createHash('sha256')
    .update(normalizeForChecksum(content))
    .digest('hex');

async function run() {
    const client = await pool.connect();

    try {
        await client.query("SELECT pg_advisory_lock(hashtext('mobiliti-dashboard-migrations'))");
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename text PRIMARY KEY,
                checksum char(64) NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const files = fs.readdirSync(migrationsDirectory)
            .filter((filename) => /^\d+_[a-z0-9_-]+\.sql$/i.test(filename))
            .sort((a, b) => a.localeCompare(b));

        for (const filename of files) {
            const sql = fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8');
            const fileChecksum = checksum(sql);
            const applied = await client.query(
                'SELECT checksum FROM schema_migrations WHERE filename = $1',
                [filename]
            );

            if (applied.rows.length > 0) {
                if (applied.rows[0].checksum.trim() !== fileChecksum) {
                    throw new Error(`Migration ${filename} wurde nachträglich verändert.`);
                }
                console.log(`[migrate] bereits vorhanden: ${filename}`);
                continue;
            }

            console.log(`[migrate] wende an: ${filename}`);
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
                    [filename, fileChecksum]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        console.log('[migrate] Datenbankschema ist aktuell.');
    } finally {
        try {
            await client.query("SELECT pg_advisory_unlock(hashtext('mobiliti-dashboard-migrations'))");
        } finally {
            client.release();
            await pool.end();
        }
    }
}

run().catch((error) => {
    console.error('[migrate] fehlgeschlagen:', error.message);
    process.exitCode = 1;
});
