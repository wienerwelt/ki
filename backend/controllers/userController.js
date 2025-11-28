// backend/controllers/userController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

// NEU: Importiere S3-Abhängigkeiten (analog zu adminBpActionsController.js)
// HINZUGEFÜGT: DeleteObjectCommand
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3Client.js");
const { v4: uuidv4 } = require('uuid');

// NEU: Sharp für die Bildkomprimierung importieren
const sharp = require('sharp');


exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await db.query(
            `SELECT
                u.id, u.username, u.email, u.first_name, u.last_name, u.organization_name,
                u.linkedin_url, u.membership_level, u.role, u.business_partner_id,
                u.article_score_min, u.article_score_max,
                u.contribution_score, u.newsletter_opt_in,
                u.profile_image_url,
                u.last_login_at, -- ✅ NEU HINZUGEFÜGT

                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = u.business_partner_id
                ) AS regions
                
             FROM users u
             WHERE u.id = $1`,
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
    // ... (Diese Funktion bleibt unverändert)
    try {
        const userId = req.user.id;
        const {
            first_name, last_name, organization_name, linkedin_url, password,
            article_score_min, article_score_max, preferred_theme, preferred_language,
            newsletter_opt_in
        } = req.body;
        const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });

        let password_hash = rows[0].password_hash;
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(password, salt);
        }

        await db.query(
            `UPDATE users SET
                first_name = $1, last_name = $2, organization_name = $3, linkedin_url = $4, password_hash = $5,
                article_score_min = $6, article_score_max = $7, preferred_theme = $8, preferred_language = $9,
                newsletter_opt_in = $10,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $11 RETURNING *`,
            [
                first_name, last_name, organization_name, linkedin_url, password_hash,
                article_score_min, article_score_max, preferred_theme, preferred_language,
                newsletter_opt_in,
                userId
            ]
        );
        
        const profileResult = await db.query(
            `SELECT
                u.id, u.username, u.email, u.first_name, u.last_name, u.organization_name,
                u.linkedin_url, u.membership_level, u.role, u.business_partner_id,
                u.article_score_min, u.article_score_max,
                u.contribution_score, u.newsletter_opt_in,
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = u.business_partner_id
                ) AS regions,
                u.profile_image_url
             FROM users u
             WHERE u.id = $1`,
            [userId]
        );

        res.json(profileResult.rows[0]);
        
    } catch (err) {
        console.error('Fehler beim Aktualisieren des Profils:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.uploadAvatar = async (req, res) => {
    // ... (Diese Funktion bleibt unverändert)
    if (!req.file) {
        return res.status(400).send({ message: 'Bitte wählen Sie eine Datei aus.' });
    }
    if (!req.user || !req.user.id) {
        return res.status(401).send({ message: 'Authentifizierung erforderlich.' });
    }

    const file = req.file;
    const userId = req.user.id;

    try {
        const processedImageBuffer = await sharp(file.buffer)
            .resize(500, 500, { 
                fit: 'cover'
            })
            .webp({ quality: 80 })
            .toBuffer();

        const uniqueFileName = `${uuidv4()}.webp`;
        const storagePath = `users/${userId}/${uniqueFileName}`; 

        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
            Body: processedImageBuffer,
            ContentType: 'image/webp',
        };

        await s3Client.send(new PutObjectCommand(params));

        const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${storagePath}`;

        await db.query(
            'UPDATE users SET profile_image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [publicUrl, userId]
        );
        
        const result = await db.query(
            `SELECT
                u.id, u.username, u.email, u.first_name, u.last_name, u.organization_name,
                u.linkedin_url, u.membership_level, u.role, u.business_partner_id,
                u.article_score_min, u.article_score_max,
                u.contribution_score, u.newsletter_opt_in,
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = u.business_partner_id
                ) AS regions,
                u.profile_image_url
             FROM users u
             WHERE u.id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
             return res.status(404).json({ message: 'Benutzer nach Upload nicht gefunden.' });
        }

        res.status(200).json({ 
            message: 'Datei erfolgreich hochgeladen und komprimiert.', 
            user: result.rows[0]
        });

    } catch (err) {
        console.error("Fehler bei der S3-Dateiverarbeitung (Avatar):", err);
        res.status(500).json({ message: 'Fehler bei der Dateiverarbeitung.' });
    }
};

// --- NEUE FUNKTION ZUM LÖSCHEN HINZUGEFÜGT ---
exports.deleteAvatar = async (req, res) => {
    const { id: userId } = req.user;

    try {
        // 1. Aktuelles Bild aus der DB holen, um S3-Key zu bekommen
        const { rows } = await db.query(
            'SELECT profile_image_url FROM users WHERE id = $1',
            [userId]
        );

        const oldUrl = rows[0]?.profile_image_url;

        if (!oldUrl) {
            // Wenn kein Bild da ist, einfach Erfolg melden (obwohl nichts zu tun war)
            const result = await db.query(
               `SELECT ... [Restliche Abfrage von oben] ... WHERE u.id = $1`,
               [userId]
            );
            return res.status(200).json({ 
                message: 'Kein Avatar zum Löschen vorhanden.',
                user: result.rows[0]
            });
        }

        // 2. (Optional, aber empfohlen) Altes Bild aus S3 löschen
        try {
            // Extrahieren des 'Keys' (z.B. users/...) aus der vollen URL
            const s3Key = new URL(oldUrl).pathname.substring(1); 
            
            await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: s3Key
            }));
        } catch (s3Err) {
            // Dies sollte den Hauptvorgang nicht blockieren.
            // Wenn das S3-Löschen fehlschlägt (z.B. Datei nicht gefunden),
            // wollen wir trotzdem den DB-Eintrag entfernen.
            console.error(`Nicht-fataler Fehler: Konnte S3-Objekt (${oldUrl}) nicht löschen:`, s3Err.message);
        }

        // 3. DB-Eintrag auf NULL setzen
        await db.query(
            'UPDATE users SET profile_image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [userId]
        );

        // 4. Aktualisiertes Benutzerprofil (wie in uploadAvatar) zurücksenden
        // (Wir kopieren die Abfrage von oben, um Konsistenz zu gewährleisten)
        const result = await db.query(
            `SELECT
                u.id, u.username, u.email, u.first_name, u.last_name, u.organization_name,
                u.linkedin_url, u.membership_level, u.role, u.business_partner_id,
                u.article_score_min, u.article_score_max,
                u.contribution_score, u.newsletter_opt_in,
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = u.business_partner_id
                ) AS regions,
                u.profile_image_url
             FROM users u
             WHERE u.id = $1`,
            [userId]
        );
        
        res.status(200).json({
            message: 'Avatar erfolgreich gelöscht.',
            user: result.rows[0]
        });

    } catch (err) {
        console.error("Fehler beim Löschen des Avatars:", err.message);
        res.status(500).json({ message: 'Fehler beim Löschen des Avatars.' });
    }
};
// --- ENDE NEUE FUNKTION ---


exports.markWelcomeAsSeen = async (req, res) => {
    // ... (Diese Funktion bleibt unverändert)
    const { id: userId } = req.user;
    try {
        await db.query('UPDATE users SET has_seen_welcome_widget = TRUE WHERE id = $1', [userId]);
        res.status(200).json({ message: 'Welcome widget marked as seen.' });
    } catch (err) {
        console.error('Error marking welcome widget:', err.message);
        res.status(500).send('Server error');
    }
};


exports.getContributionHistory = async (req, res) => {
    // ... (Diese Funktion bleibt unverändert)
    const { id: userId } = req.user;
    try {
        const { rows } = await db.query(
            'SELECT * FROM user_score_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Abrufen der Punkte-Historie:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};


// --- FAVORITEN-FUNKTIONEN ---
exports.getFavorites = async (req, res) => {
    // ... (Diese Funktion bleibt unverändert)
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
    // ... (Diese Funktion bleibt unverändert)
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
    // ... (Diese Funktion bleibt unverändert)
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
    // ... (Diese Funktion bleibt unverändert)
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

exports.addUserTag = async (req, res) => {
    // ... (Diese Funktion bleibt unverändert)
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

exports.removeUserTag = async (req, res) => {
    // ... (Diese Funktion bleibt unverändert)
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


// backend/controllers/userController.js

// ... bestehende Imports

// NEU: Usersuche für Autocomplete
exports.searchUsers = async (req, res) => {
    const { q } = req.query;
    const { business_partner_id, id: currentUserId } = req.user;

    if (!q || q.length < 2) return res.json([]);

    try {
        // Suche nach Vorname, Nachname oder Username
        // Nur im eigenen Business Partner & nicht sich selbst
        const query = `
            SELECT id, username, first_name, last_name, profile_image_url
            FROM users
            WHERE business_partner_id = $1
            AND id != $2
            AND (
                username ILIKE $3 OR 
                first_name ILIKE $3 OR 
                last_name ILIKE $3
            )
            LIMIT 5
        `;
        const { rows } = await db.query(query, [business_partner_id, currentUserId, `%${q}%`]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Suche fehlgeschlagen' });
    }
};


exports.getUserActivities = async (req, res) => {
    const { id: userId } = req.user;

    try {
        // Wir kombinieren Score-Logs (Punkte) mit wichtigen System-Events
        // Limit auf 20 Einträge für das Widget
        const query = `
            SELECT * FROM (
                -- 1. Gamification & Community Aktionen (aus Score Logs)
                SELECT 
                    id::text,
                    action_type as type,
                    description,
                    points_change as points,
                    created_at,
                    'score' as source
                FROM user_score_logs
                WHERE user_id = $1

                UNION ALL

                -- 2. Wichtige System-Events (aus Activity Log, falls vorhanden, oder Community Tabellen direkt)
                -- Hier nehmen wir exemplarisch direkte Community Aktionen, falls keine Punkte vergeben wurden,
                -- oder File Uploads. (Vereinfacht: Wir nutzen hier Uploads aus der File-Tabelle)
                SELECT 
                    id::text,
                    'FILE_UPLOAD' as type,
                    'Datei hochgeladen: ' || filename as description,
                    0 as points,
                    created_at,
                    'file' as source
                FROM business_partner_files
                WHERE uploader_id = $1
                
                UNION ALL
                
                -- 3. Letzte Logins (aus Users Tabelle ist zu wenig, wir nehmen Activity Log falls vorhanden)
                -- Falls Sie eine activity_log Tabelle haben:
                SELECT
                    id::text,
                    'LOGIN' as type,
                    'Erfolgreicher Login' as description,
                    0 as points,
                    timestamp as created_at,
                    'system' as source
                FROM activity_log
                WHERE user_id = $1 AND action_type = 'USER_LOGIN'
            ) as combined_activities
            ORDER BY created_at DESC
            LIMIT 20;
        `;

        const { rows } = await db.query(query, [userId]);
        res.json(rows);

    } catch (err) {
        console.error('Fehler beim Laden der Aktivitäten:', err.message);
        res.status(500).json({ message: 'Serverfehler' });
    }
};