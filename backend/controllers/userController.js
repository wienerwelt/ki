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

// --- FAVORITEN-FUNKTIONEN ---
exports.getFavorites = async (req, res) => {
    const { id: userId } = req.user;
    const { widgetType } = req.query;
    if (!widgetType) return res.status(400).json({ message: 'Widget-Typ ist erforderlich.' });
    try {
        const { rows } = await db.query(
            `SELECT * FROM user_favorites WHERE user_id = $1 AND favorite_type = $2 ORDER BY created_at ASC`,
            [userId, widgetType]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Abrufen der Benutzerfavoriten:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};


exports.addFavorite = async (req, res) => {
    const { id: userId } = req.user;
    const { widgetType, favorite } = req.body;
    if (!widgetType || !favorite || !favorite.external_id) {
        return res.status(400).json({ message: 'Widget-Typ und Favorit mit external_id sind erforderlich.' });
    }
    try {
        const {
            external_id, name, country_code, brand, street,
            house_no, post_code, city, lat, lng, provider,
            operator_name, charge_point_count, power_kw, connector_types
        } = favorite;

        const query = `
            INSERT INTO user_favorites (
                user_id, favorite_type, external_id, name, country_code, brand,
                street, house_no, post_code, city, lat, lng, provider,
                operator_name, charge_point_count, power_kw, connector_types
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (user_id, favorite_type, external_id) DO NOTHING;
        `;
        const params = [
            userId, widgetType, external_id, name, country_code, brand,
            street, house_no, post_code, city, lat, lng, provider,
            operator_name, charge_point_count, power_kw, connector_types
        ];

        await db.query(query, params);
        res.status(201).json({ message: 'Favorit hinzugefügt.' });
    } catch (err) {
        console.error('Fehler beim Hinzufügen des Favoriten:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};


exports.removeFavorite = async (req, res) => {
    const { id: userId } = req.user;
    const { externalId } = req.params; // Name aus userRoutes.js
    const { widgetType } = req.query;
    if (!widgetType || !externalId) {
        return res.status(400).json({ message: 'Widget-Typ und Favoriten-ID sind erforderlich.' });
    }
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

exports.getUserTags = async (req, res) => {
    const { id: userId } = req.user;
    try {
        const result = await db.query(
            'SELECT tag_name FROM user_saved_tags WHERE user_id = $1 ORDER BY tag_name ASC',
            [userId]
        );
        res.json(result.rows.map(row => row.tag_name));
    } catch (err) {
        console.error('Fehler beim Abrufen der Benutzer-Tags:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};

/**
 * Fügt einen neuen Tag für den aktuellen Benutzer hinzu.
 */
exports.addUserTag = async (req, res) => {
    const { id: userId } = req.user;
    const { tagName } = req.body;
    if (!tagName || typeof tagName !== 'string' || tagName.trim() === '') {
        return res.status(400).json({ message: 'Ein gültiger Tag-Name ist erforderlich.' });
    }
    const sanitizedTag = tagName.trim();
    try {
        await db.query(
            'INSERT INTO user_saved_tags (user_id, tag_name) VALUES ($1, $2) ON CONFLICT (user_id, tag_name) DO NOTHING',
            [userId, sanitizedTag]
        );
        res.status(201).json({ message: `Tag "${sanitizedTag}" hinzugefügt.` });
    } catch (err) {
        console.error('Fehler beim Hinzufügen des Tags:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};

/**
 * Entfernt einen Tag für den aktuellen Benutzer.
 */
exports.removeUserTag = async (req, res) => {
    const { id: userId } = req.user;
    const { tagName } = req.params; // GEÄNDERT: von req.body zu req.params
    if (!tagName || typeof tagName !== 'string' || tagName.trim() === '') {
        return res.status(400).json({ message: 'Ein gültiger Tag-Name ist erforderlich.' });
    }
    try {
        await db.query(
            'DELETE FROM user_saved_tags WHERE user_id = $1 AND tag_name = $2',
            [userId, tagName] // .trim() ist nicht mehr nötig, da URLs automatisch getrimmt werden
        );
        res.status(200).json({ message: `Tag "${tagName}" entfernt.` });
    } catch (err) {
        console.error('Fehler beim Entfernen des Tags:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};