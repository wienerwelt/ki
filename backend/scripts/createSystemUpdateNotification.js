// backend/scripts/createSystemUpdateNotification.js
// Usage inside API container:
// SYSTEM_UPDATE_VERSION="2026.07.08-1950" node scripts/createSystemUpdateNotification.js

const db = require('../config/db');

const SYSTEM_NOTIFICATION_TYPES = [
  'system_update_reload',
  'system_update_info',
  'system_update_admin',
];

const boolFromEnv = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'ja', 'y'].includes(String(value).toLowerCase());
};

const sanitizeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
};

const normalizeTargetRoles = (value) => {
  if (!value) return null;
  const roles = String(value)
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  return roles.length > 0 ? roles : null;
};

async function main() {
  const now = new Date();
  const version = sanitizeText(
    process.env.SYSTEM_UPDATE_VERSION,
    now.toISOString().replace(/[-:T]/g, '').slice(0, 12)
  );
  const requiresReload = boolFromEnv(process.env.SYSTEM_UPDATE_REQUIRES_RELOAD, true);
  const title = sanitizeText(
    process.env.SYSTEM_UPDATE_TITLE,
    requiresReload ? 'Neue Version verfügbar' : 'Systemhinweis'
  );
  const message = sanitizeText(
    process.env.SYSTEM_UPDATE_MESSAGE,
    requiresReload
      ? 'Bitte aktualisieren Sie die Seite, um die neueste Oberfläche zu laden.'
      : 'Das System wurde aktualisiert.'
  );
  const adminMessage = sanitizeText(
    process.env.SYSTEM_UPDATE_ADMIN_MESSAGE,
    `Letztes Systemupdate: ${now.toLocaleString('de-DE')}\nVersion: ${version}\nStatus: erfolgreich`
  );
  const targetRoles = normalizeTargetRoles(process.env.SYSTEM_UPDATE_TARGET_ROLES);
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Keine Historie gewünscht: alte Systemupdate-Hinweise ersetzen.
    await client.query(
      'DELETE FROM user_notifications WHERE type = ANY($1::text[])',
      [SYSTEM_NOTIFICATION_TYPES]
    );

    const type = requiresReload ? 'system_update_reload' : 'system_update_info';
    const roleFilter = targetRoles ? 'AND role = ANY($4::text[])' : '';
    const userParams = targetRoles
      ? [type, title, message, targetRoles]
      : [type, title, message];

    const userInsert = await client.query(
      `
      INSERT INTO user_notifications (user_id, type, title, message)
      SELECT id, $1, $2, $3
      FROM users
      WHERE is_active = TRUE
        AND (active_until IS NULL OR active_until > NOW())
        AND role <> 'admin'
        ${roleFilter}
      `,
      userParams
    );

    const adminInsert = await client.query(
      `
      INSERT INTO user_notifications (user_id, type, title, message)
      SELECT id, 'system_update_admin', $1, $2
      FROM users
      WHERE is_active = TRUE
        AND (active_until IS NULL OR active_until > NOW())
        AND role = 'admin'
      `,
      ['Systemupdate erfolgreich', adminMessage]
    );

    await client.query('COMMIT');

    console.log('[system-update] Notifications created');
    console.log(`[system-update] version=${version}`);
    console.log(`[system-update] users=${userInsert.rowCount}`);
    console.log(`[system-update] admins=${adminInsert.rowCount}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[system-update] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end?.();
  }
}

main();
