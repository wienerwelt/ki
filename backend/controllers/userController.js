// backend/controllers/userController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

// Holt die Profildaten des aktuell eingeloggten Benutzers
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await db.query(
            `SELECT 
                id, username, email, first_name, last_name, organization_name, 
                linkedin_url, membership_level, role, business_partner_id 
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Abrufen des Profils:', err.message);
        res.status(500).send('Serverfehler');
    }
};

// Aktualisiert das Profil des aktuell eingeloggten Benutzers
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Erlaubte Felder, die der Benutzer ändern darf
        const { first_name, last_name, organization_name, linkedin_url, password } = req.body;

        const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        const user = rows[0];

        // Passwort nur aktualisieren, wenn ein neues angegeben wurde
        let password_hash = user.password_hash;
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(password, salt);
        }

        // Führt das Update nur mit den erlaubten Feldern durch
        await db.query(
            `UPDATE users SET 
                first_name = $1, 
                last_name = $2, 
                organization_name = $3, 
                linkedin_url = $4, 
                password_hash = $5,
                updated_at = CURRENT_TIMESTAMP 
             WHERE id = $6`,
            [first_name, last_name, organization_name, linkedin_url, password_hash, userId]
        );

        res.json({ message: 'Profil erfolgreich aktualisiert.' });
    } catch (err) {
        console.error('Fehler beim Aktualisieren des Profils:', err.message);
        res.status(500).send('Serverfehler');
    }
};
