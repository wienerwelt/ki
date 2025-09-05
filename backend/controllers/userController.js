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

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            first_name, last_name, organization_name, linkedin_url, password, 
            article_score_min, article_score_max, preferred_theme, preferred_language 
        } = req.body;
        const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        
        let password_hash = rows[0].password_hash;
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(password, salt);
        }

        const updatedUserResult = await db.query(
            `UPDATE users SET
                first_name = $1, last_name = $2, organization_name = $3, linkedin_url = $4, password_hash = $5,
                article_score_min = $6, article_score_max = $7, preferred_theme = $8, preferred_language = $9,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $10 RETURNING *`,
            [
                first_name, last_name, organization_name, linkedin_url, password_hash, 
                article_score_min, article_score_max, preferred_theme, preferred_language, 
                userId
            ]
        );
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
        console.error('Error marking welcome widget:', err.message);
        res.status(500).send('Server error');
    }
};

// --- FAVORITEN-FUNKTIONEN (ANGEPASST AN IHR SCHEMA) ---
exports.getFavorites = async (req, res) => {
    const { id: userId } = req.user;
    const { widgetType } = req.query;
    if (!widgetType) return res.status(400).json({ message: 'Widget-Typ ist erforderlich.' });
    try {
        const result = await db.query(
            'SELECT external_id, name, country_code FROM user_favorites WHERE user_id = $1 AND favorite_type = $2',
            [userId, widgetType]
        );
        res.json(result.rows.map(row => ({ 
            external_id: row.external_id, 
            name: row.name,
            country: row.country_code
        })));
    } catch (err) {
        console.error('Fehler beim Abrufen der Benutzerfavoriten:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};

exports.addFavorite = async (req, res) => {
    const { id: userId } = req.user;
    const { widgetType, favorite } = req.body;
    if (!widgetType || !favorite || !favorite.external_id || !favorite.name || !favorite.country) {
        return res.status(400).json({ message: 'Widget-Typ und Favorit mit external_id, Name und Land sind erforderlich.' });
    }
    try {
        await db.query(
            `INSERT INTO user_favorites (user_id, favorite_type, external_id, name, country_code)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, favorite_type, external_id) DO NOTHING`,
            [userId, widgetType, favorite.external_id, favorite.name, favorite.country]
        );
        res.status(201).json({ message: 'Favorit hinzugefügt.' });
    } catch (err) {
        console.error('Fehler beim Hinzufügen des Favoriten:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};

exports.removeFavorite = async (req, res) => {
    const { id: userId } = req.user;
    const { externalId } = req.params;
    const { widgetType } = req.query;
    if (!widgetType || !externalId) return res.status(400).json({ message: 'Widget-Typ und Favoriten-ID sind erforderlich.' });
    try {
        await db.query(
            'DELETE FROM user_favorites WHERE user_id = $1 AND favorite_type = $2 AND external_id = $3',
            [userId, widgetType, externalId]
        );
        res.status(200).json({ message: 'Favorit entfernt.' });
    } catch (err) {
        console.error('Fehler beim Entfernen des Favoriten:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};