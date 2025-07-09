// backend/controllers/sessionController.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Funktion zum Erneuern des Tokens
exports.renewToken = async (req, res) => {
    try {
        // Die ID des Benutzers aus dem vorherigen Token (von der authMiddleware)
        const userId = req.user.id;

        // Lade die vollständigen Benutzerdaten ERNEUT aus der Datenbank,
        // genau wie in der login-Funktion, um sicherzustellen, dass alle Daten aktuell sind.
        const userResult = await db.query(
            `SELECT 
                u.*, 
                bp.name as business_partner_name, 
                bp.dashboard_title,
                (SELECT COALESCE(json_agg(r.* ORDER BY r.name), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = u.business_partner_id) as regions
             FROM users u 
             LEFT JOIN business_partners bp ON u.business_partner_id = bp.id 
             WHERE u.id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Benutzer für Token-Erneuerung nicht gefunden.' });
        }
        const user = userResult.rows[0];

        // Erstellen Sie den Payload für das neue Token mit den vollständigen Daten.
        const payload = {
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                business_partner_id: user.business_partner_id,
                business_partner_name: user.business_partner_name,
                dashboard_title: user.dashboard_title,
                regions: user.regions, // <-- REGIONEN SIND JETZT WIEDER ENTHALTEN
            },
        };

        // Erstellen Sie ein neues Token mit einer neuen Laufzeit
        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // Senden Sie das neue Token an den Client
        res.json({ token });

    } catch (err) {
        console.error('Fehler bei der Token-Erneuerung:', err.message);
        res.status(500).send('Serverfehler');
    }
};
