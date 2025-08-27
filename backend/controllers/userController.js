// backend/controllers/userController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await db.query(
            `SELECT
                id, username, email, first_name, last_name, organization_name,
                linkedin_url, membership_level, role, business_partner_id,
                article_score_min, article_score_max,
                contribution_score
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

// KORRIGIERTE updateProfile Funktion
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const { 
            first_name, last_name, organization_name, linkedin_url, password, 
            article_score_min, article_score_max, preferred_theme, preferred_language 
        } = req.body;

        const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        const user = rows[0];

        let password_hash = user.password_hash;
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(password, salt);
        }

        // NEU: Das UPDATE-Statement wurde um die neuen Felder erweitert
        const updatedUserResult = await db.query(
            `UPDATE users SET
                first_name = $1,
                last_name = $2,
                organization_name = $3,
                linkedin_url = $4,
                password_hash = $5,
                article_score_min = $6,
                article_score_max = $7,
                preferred_theme = $8,
                preferred_language = $9,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $10
             RETURNING *`, // Wichtig: Gib den aktualisierten Benutzer zurück
            [
                first_name, last_name, organization_name, linkedin_url, password_hash, 
                article_score_min, article_score_max, preferred_theme, preferred_language, 
                userId
            ]
        );
        
        // Sende die vollständigen, aktualisierten Benutzerdaten zurück an das Frontend
        res.json(updatedUserResult.rows[0]);

    } catch (err) {
        console.error('Fehler beim Aktualisieren des Profils:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.markWelcomeAsSeen = async (req, res) => {
    const { id: userId } = req.user;
    try {
        await db.query('UPDATE users SET has_seen_welcome_widget = TRUE WHERE id = $1', [userId]);
        res.status(200).json({ message: 'Welcome widget marked as seen.' });
    } catch (err) {
        console.error('Error marking welcome widget as seen:', err.message);
        res.status(500).send('Server error');
    }
};