const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const BASE_URL = String(process.env.SMOKE_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getAdminToken() {
  assert(process.env.JWT_SECRET, 'JWT_SECRET fehlt.');
  const { rows } = await db.query(`
    SELECT u.id, u.role, u.business_partner_id, u.auth_version
    FROM users u
    LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
    WHERE LOWER(u.role) = 'admin'
      AND u.is_active = TRUE
      AND (u.active_until IS NULL OR u.active_until > NOW())
      AND (u.business_partner_id IS NULL OR (
        COALESCE(bp.is_active, TRUE) = TRUE
        AND (bp.subscription_end_date IS NULL OR bp.subscription_end_date >= CURRENT_DATE)
      ))
    ORDER BY u.created_at ASC
    LIMIT 1
  `);
  assert(rows[0], 'Für den Galerie-Smoke-Test fehlt ein aktiver Admin.');

  return jwt.sign({
    sub: rows[0].id,
    role: rows[0].role,
    business_partner_id: rows[0].business_partner_id,
    av: Number(rows[0].auth_version || 0),
  }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });
}

async function run() {
  const token = await getAdminToken();
  const headers = { Authorization: `Bearer ${token}` };
  const directory = path.join(__dirname, '..', 'public', 'social-media');
  const filename = `smoke-gallery-${randomUUID()}.png`;
  const filePath = path.join(directory, filename);
  const encodedName = encodeURIComponent(filename);

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filePath, PNG_PIXEL, { flag: 'wx' });

  try {
    const unauthenticated = await fetch(`${BASE_URL}/api/admin/social-media/gallery-files/social-media/${encodedName}/view`);
    assert(unauthenticated.status === 401, `Vorschau ist ohne Anmeldung erreichbar (HTTP ${unauthenticated.status}).`);

    const view = await fetch(`${BASE_URL}/api/admin/social-media/gallery-files/social-media/${encodedName}/view`, { headers });
    const viewBody = Buffer.from(await view.arrayBuffer());
    assert(view.status === 200, `Vorschau liefert HTTP ${view.status}.`);
    assert(String(view.headers.get('content-type') || '').startsWith('image/png'), 'Vorschau liefert keinen PNG-Inhaltstyp.');
    assert(/^inline(?:;|$)/i.test(String(view.headers.get('content-disposition') || '')), 'Vorschau wird nicht inline ausgeliefert.');
    assert(viewBody.equals(PNG_PIXEL), 'Vorschauinhalt stimmt nicht mit der Datei überein.');

    const download = await fetch(`${BASE_URL}/api/admin/social-media/gallery-files/social-media/${encodedName}/download`, { headers });
    const downloadBody = Buffer.from(await download.arrayBuffer());
    assert(download.status === 200, `Download liefert HTTP ${download.status}.`);
    assert(String(download.headers.get('content-disposition') || '').startsWith('attachment;'), 'Download wird nicht als Anlage ausgeliefert.');
    assert(downloadBody.equals(PNG_PIXEL), 'Downloadinhalt stimmt nicht mit der Datei überein.');

    const invalidFolder = await fetch(`${BASE_URL}/api/admin/social-media/gallery-files/grafiken/${encodedName}/view`, { headers });
    assert(invalidFolder.status === 400, `Nicht freigegebener Galerieordner liefert HTTP ${invalidFolder.status} statt 400.`);

    console.log(JSON.stringify({
      ok: true,
      authenticatedPreview: true,
      authenticatedDownload: true,
      unauthorizedRequestBlocked: true,
      folderBoundaryChecked: true,
    }, null, 2));
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

run()
  .catch((error) => {
    console.error('[smoke:social-media-gallery]', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
