const db = require('../config/db');
const jwt = require('jsonwebtoken');

const REQUIRED_COLUMNS = [
    'public_link_enabled',
    'public_token_hash',
    'public_token_preview',
    'public_link_created_at',
    'public_link_created_by',
    'public_download_count',
    'public_link_download_count',
    'public_link_expires_at',
    'public_max_downloads',
    'public_last_downloaded_at',
    'malware_scan_status',
    'malware_scanned_at',
    'malware_scan_details',
];

async function run() {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
        throw new Error('Der Dokumentlink-Smoke-Test darf nicht in Produktion laufen.');
    }

    let testFileId = null;
    try {
        const columnsResult = await db.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'business_partner_files'
              AND column_name = ANY($1::text[])
        `, [REQUIRED_COLUMNS]);
        const existingColumns = new Set(columnsResult.rows.map((row) => row.column_name));
        const missingColumns = REQUIRED_COLUMNS.filter((column) => !existingColumns.has(column));
        if (missingColumns.length > 0) {
            throw new Error(`Fehlende Datenbankspalten: ${missingColumns.join(', ')}`);
        }

        const integrityResult = await db.query(`
            SELECT COUNT(*)::int AS invalid_count
            FROM public.business_partner_files
            WHERE (public_link_enabled = true AND public_token_hash IS NULL)
               OR public_download_count < 0
               OR public_link_download_count < 0
               OR (public_max_downloads IS NOT NULL AND public_max_downloads NOT BETWEEN 1 AND 1000000)
        `);
        if (integrityResult.rows[0].invalid_count > 0) {
            throw new Error(`${integrityResult.rows[0].invalid_count} inkonsistente externe Dateifreigaben gefunden.`);
        }

        const invalidResponse = await fetch(
            'http://127.0.0.1:5000/api/public/files/00000000-0000-0000-0000-000000000000/12345678901234567890123456789012/download',
            { redirect: 'manual' }
        );
        if (invalidResponse.status !== 404) {
            throw new Error(`Ungültiger öffentlicher Dateilink liefert HTTP ${invalidResponse.status} statt 404.`);
        }

        const rolesResult = await db.query(`
            SELECT id, role, business_partner_id
            FROM users
            WHERE is_active = true
              AND role IN ('demo', 'assistenz', 'admin')
            ORDER BY CASE role WHEN 'demo' THEN 1 WHEN 'assistenz' THEN 2 ELSE 3 END
        `);
        const blockedUser = rolesResult.rows.find((user) => user.role === 'demo');
        const manager = rolesResult.rows.find((user) => user.role === 'assistenz')
            || rolesResult.rows.find((user) => user.role === 'admin');
        if (!blockedUser || !manager) {
            throw new Error('Für den Rollen-Smoke-Test fehlen ein Demo- und ein Admin-/Assistenz-Benutzer.');
        }

        const createToken = (user) => jwt.sign({ user }, process.env.JWT_SECRET, { expiresIn: '5m' });
        const blockedUploadResponse = await fetch('http://127.0.0.1:5000/api/files/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${createToken(blockedUser)}` },
        });
        if (blockedUploadResponse.status !== 403) {
            throw new Error(`Unberechtigter Upload liefert HTTP ${blockedUploadResponse.status} statt 403.`);
        }

        const invalidPolicyResponse = await fetch(
            'http://127.0.0.1:5000/api/files/00000000-0000-0000-0000-000000000000/public-link',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${createToken(manager)}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ expiresInDays: 3651 }),
            }
        );
        if (invalidPolicyResponse.status !== 400) {
            throw new Error(`Ungültige Link-Gültigkeit liefert HTTP ${invalidPolicyResponse.status} statt 400.`);
        }

        let targetBusinessPartnerId = manager.business_partner_id;
        if (!targetBusinessPartnerId) {
            const partnerResult = await db.query('SELECT id FROM business_partners ORDER BY created_at LIMIT 1');
            targetBusinessPartnerId = partnerResult.rows[0]?.id;
        }
        if (!targetBusinessPartnerId) throw new Error('Kein Mandant für den Direktlink-Smoke-Test verfügbar.');

        const testFileResult = await db.query(`
            INSERT INTO business_partner_files
                (filename, storage_path, file_type, file_size, uploader_id, business_partner_id,
                 description, tags, malware_scan_status, malware_scanned_at)
            VALUES
                ('codex-public-link-smoke.pdf', $1, 'application/pdf', 1, $2, $3,
                 'Temporärer Dokumentlink-Smoke-Test', ARRAY['smoke-test'], 'clean', NOW())
            RETURNING id
        `, [`smoke-tests/public-file-links-${Date.now()}.pdf`, manager.id, targetBusinessPartnerId]);
        testFileId = testFileResult.rows[0].id;

        const managerHeaders = {
            Authorization: `Bearer ${createToken(manager)}`,
            'Content-Type': 'application/json',
        };
        const managerListResponse = await fetch('http://127.0.0.1:5000/api/files?limit=200', {
            headers: managerHeaders,
        });
        const managerFiles = await managerListResponse.json();
        if (!managerListResponse.ok || !Array.isArray(managerFiles) || !managerFiles.some((file) => file.id === testFileId)) {
            throw new Error(`Temporäre Datei ist für die Assistenz nicht mandantengerecht sichtbar (HTTP ${managerListResponse.status}; Mandant ${manager.business_partner_id || 'fehlt'}).`);
        }
        const createResponse = await fetch(`http://127.0.0.1:5000/api/files/${testFileId}/public-link`, {
            method: 'POST',
            headers: managerHeaders,
            body: JSON.stringify({ expiresInDays: 1, maxDownloads: 1 }),
        });
        const createBody = await createResponse.json();
        if (!createResponse.ok || !createBody.url || createBody.file?.public_max_downloads !== 1) {
            throw new Error(`Test-Direktlink konnte nicht erstellt werden (HTTP ${createResponse.status}: ${createBody.message || 'ohne Meldung'}; Rolle ${manager.role}).`);
        }

        const expiresAt = new Date(createBody.file.public_link_expires_at).getTime();
        const expectedMinimumExpiry = Date.now() + 20 * 60 * 60 * 1000;
        const expectedMaximumExpiry = Date.now() + 28 * 60 * 60 * 1000;
        if (expiresAt < expectedMinimumExpiry || expiresAt > expectedMaximumExpiry) {
            throw new Error('Das Ablaufdatum des Test-Direktlinks liegt nicht ungefähr einen Tag in der Zukunft.');
        }

        const firstDownloadResponse = await fetch(createBody.url, { redirect: 'manual' });
        if (firstDownloadResponse.status !== 302) {
            throw new Error(`Erster erlaubter Download liefert HTTP ${firstDownloadResponse.status} statt 302.`);
        }
        const limitedDownloadResponse = await fetch(createBody.url, { redirect: 'manual' });
        if (limitedDownloadResponse.status !== 410) {
            throw new Error(`Erreichtes Downloadlimit liefert HTTP ${limitedDownloadResponse.status} statt 410.`);
        }

        const disableResponse = await fetch(`http://127.0.0.1:5000/api/files/${testFileId}/public-link`, {
            method: 'DELETE',
            headers: managerHeaders,
        });
        if (!disableResponse.ok) {
            throw new Error(`Test-Direktlink konnte nicht deaktiviert werden (HTTP ${disableResponse.status}).`);
        }
        const revokedDownloadResponse = await fetch(createBody.url, { redirect: 'manual' });
        if (revokedDownloadResponse.status !== 404) {
            throw new Error(`Deaktivierter Direktlink liefert HTTP ${revokedDownloadResponse.status} statt 404.`);
        }

        console.log(JSON.stringify({
            ok: true,
            checkedColumns: REQUIRED_COLUMNS.length,
            invalidLinks: 0,
            invalidLinkStatus: invalidResponse.status,
            blockedUploadStatus: blockedUploadResponse.status,
            invalidPolicyStatus: invalidPolicyResponse.status,
            createLinkStatus: createResponse.status,
            firstDownloadStatus: firstDownloadResponse.status,
            limitedDownloadStatus: limitedDownloadResponse.status,
            disableLinkStatus: disableResponse.status,
            revokedDownloadStatus: revokedDownloadResponse.status,
        }));
    } finally {
        if (testFileId) {
            await db.query('DELETE FROM activity_log WHERE target_id = $1', [testFileId]);
            await db.query('DELETE FROM business_partner_files WHERE id = $1', [testFileId]);
        }
        await db.end();
    }
}

run().catch((error) => {
    console.error('[smoke:public-file-links] fehlgeschlagen:', error.message);
    process.exitCode = 1;
});
