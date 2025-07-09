// backend/controllers/dashboardController.js
const db = require('../config/db');

exports.getDashboardConfig = async (req, res) => {
    try {
        const userId = req.user.id; // Kommt vom Auth-Middleware

        // Holen der Standard- oder ersten Konfiguration des Benutzers
        const config = await db.query(
            'SELECT config FROM dashboard_configurations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [userId]
        );

        if (config.rows.length === 0) {
            // Wenn keine Konfiguration gefunden, eine leere Standard-Konfiguration zurückgeben
            return res.json({ config: { widgets: [] } });
        }

        res.json(config.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

exports.saveDashboardConfig = async (req, res) => {
    const { name, config } = req.body;
    const userId = req.user.id; // Kommt vom Auth-Middleware

    try {
        // Für den Prototyp überschreiben wir einfach die letzte/Standardkonfiguration oder erstellen eine neue
        // In einer echten Anwendung würde man hier mehr Logik für benannte Konfigurationen und Updates einbauen
        const existingConfig = await db.query(
            'SELECT id FROM dashboard_configurations WHERE user_id = $1 AND name = $2',
            [userId, name]
        );

        let result;
        if (existingConfig.rows.length > 0) {
            // Update
            result = await db.query(
                'UPDATE dashboard_configurations SET config = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
                [config, existingConfig.rows[0].id]
            );
        } else {
            // Insert
            result = await db.query(
                'INSERT INTO dashboard_configurations (user_id, name, config) VALUES ($1, $2, $3) RETURNING *',
                [userId, name, config]
            );
        }

        res.status(200).json({ message: 'Dashboard configuration saved', config: result.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};