// backend/controllers/dashboardController.js
const db = require('../config/db');

/**
 * Liefert die Default-Config des Users, sonst die zuletzt aktualisierte.
 * Antwort: { id, name, is_default, config, updated_at }
 * Wenn keine vorhanden: { name: 'Mein Dashboard', config: { layout: [], widgets: [] } }
 */
exports.getDashboardConfig = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // zuerst Default, sonst letzte aktualisierte
    const q = `
      SELECT id, name, config, is_default, created_at, updated_at
      FROM dashboard_configurations
      WHERE user_id = $1
      ORDER BY is_default DESC, updated_at DESC
      LIMIT 1
    `;
    const r = await db.query(q, [userId]);

    if (r.rows.length === 0) {
      // noch keine Config vorhanden → leeres Default zurückgeben
      return res.json({
        name: 'Mein Dashboard',
        config: { layout: [], widgets: [] },
      });
    }

    const row = r.rows[0];
    return res.json({
      id: row.id,
      name: row.name,
      is_default: row.is_default,
      config: row.config,          // erwartet { layout: [], widgets: [] }
      updated_at: row.updated_at,
    });
  } catch (err) {
    console.error('getDashboardConfig error:', err);
    res.status(500).send('Server error');
  }
};

/**
 * Upsert nach (user_id, name).
 * Body: { name: string, config: object, isDefault?: boolean }
 * - Wenn isDefault=true, werden alle anderen des Users auf false gesetzt.
 * Antwort: { message: 'OK', record: {...} }
 */
exports.saveDashboardConfig = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { name, config, isDefault } = req.body || {};
    if (!name || !config || typeof config !== 'object') {
      return res.status(400).json({ message: 'name und config sind erforderlich' });
    }

    // Upsert via UNIQUE (user_id, name)
    const upsertSql = `
      INSERT INTO dashboard_configurations (user_id, name, config, is_default)
      VALUES ($1, $2, $3, COALESCE($4, false))
      ON CONFLICT (user_id, name)
      DO UPDATE SET
        config = EXCLUDED.config,
        is_default = EXCLUDED.is_default,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, name, config, is_default, updated_at
    `;
    const upsertRes = await db.query(upsertSql, [userId, name, config, !!isDefault]);
    const record = upsertRes.rows[0];

    // Wenn diese Config als Default markiert wird → alle anderen des Users ent-defaulten
    if (isDefault) {
      await db.query(
        `UPDATE dashboard_configurations
         SET is_default = FALSE
         WHERE user_id = $1 AND name <> $2`,
        [userId, name]
      );
    }

    return res.json({ message: 'OK', record });
  } catch (err) {
    console.error('saveDashboardConfig error:', err);
    if (err.code === '23505') {
      // UNIQUE (user_id, name) – sollte durch Upsert nicht auftreten, nur falls parallel
      return res.status(409).json({ message: 'Name bereits vergeben' });
    }
    res.status(500).send('Server error');
  }
};
