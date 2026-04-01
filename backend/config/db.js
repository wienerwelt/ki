const { Pool } = require('pg');

function maskConnectionInfo() {
  return {
    host: process.env.DB_HOST || 'undefined',
    port: process.env.DB_PORT || 'undefined',
    database: process.env.DB_DATABASE || 'undefined',
    user: process.env.DB_USER || 'undefined',
    passwordSet: process.env.DB_PASSWORD ? 'ja' : 'nein',
    databaseUrlSet: process.env.DATABASE_URL ? 'ja' : 'nein',
  };
}

console.log('[db] Initialisiere PostgreSQL-Pool mit:', maskConnectionInfo());

// --- DIE ENTSCHEIDENDE ÄNDERUNG ---
// Wenn eine DATABASE_URL existiert, nutzen wir diese. 
// Falls nicht, fallen wir auf die alten Einzelvariablen zurück.
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
// ----------------------------------

pool.on('error', (err) => {
  console.error('[db] Unerwarteter Fehler auf idle client:', err);
});

async function logDbConnectionInfo() {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT current_database(), version()');
    console.log('[db] Verbindung erfolgreich.');
    console.log('[db] Aktive DB:', result.rows[0].current_database);
    console.log('[db] PostgreSQL Version:', result.rows[0].version);
  } catch (err) {
    console.error('[db] Verbindungsprüfung fehlgeschlagen:', err.message);
  } finally {
    if (client) client.release();
  }
}

if (process.env.NODE_ENV !== 'test') {
  logDbConnectionInfo();
}

module.exports = pool;