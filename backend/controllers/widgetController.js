// backend/controllers/widgetController.js (Aktualisiert)
const db = require('../config/db');

exports.getAvailableWidgetTypes = async (req, res) => {
    try {
        const userId = req.user.id; // Kommt vom Auth-Middleware

        // Zuerst die business_partner_id des Benutzers abfragen
        const userResult = await db.query(
            'SELECT business_partner_id FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0 || !userResult.rows[0].business_partner_id) {
            // Wenn kein BP zugewiesen, leere Liste oder Fehler senden (je nach gewünschtem Verhalten)
            return res.status(403).json({ message: 'User not assigned to a Business Partner or access denied.' });
        }

        const businessPartnerId = userResult.rows[0].business_partner_id;

        // Jetzt alle Widget-Typen abfragen, auf die dieser Business Partner Zugriff hat
        const result = await db.query(
            `SELECT wt.*
             FROM widget_types wt
             JOIN business_partner_widget_access bpwa ON wt.id = bpwa.widget_type_id
             WHERE bpwa.business_partner_id = $1
             ORDER BY wt.name ASC`,
            [businessPartnerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching available widget types:', err.message);
        res.status(500).send('Server error');
    }
};