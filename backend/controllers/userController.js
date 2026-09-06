// backend/controllers/userController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3Client.js");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { getMembershipExpiry } = require('../utils/membershipExpiry');

function withMembershipExpiry(profile) {
    const expiry = getMembershipExpiry(profile?.active_until);
    return {
        ...profile,
        membership_expires_on: expiry.expiresOn,
        membership_days_remaining: expiry.daysRemaining,
    };
}


exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await db.query(
                `SELECT
                u.id, u.username, u.email, u.first_name, u.last_name, u.organization_name,
                u.linkedin_url, u.membership_level, u.role, u.business_partner_id,
                u.article_score_min, u.article_score_max,
                u.contribution_score, u.newsletter_opt_in, u.briefing_email_enabled,
                u.member_newsletter_enabled, u.active_until,
                u.newsletter_opt_in_confirmed_at,
                u.public_profile_enabled,
                u.show_email_publicly,
                u.show_phone_publicly,
                u.show_organization_publicly,
                u.show_linkedin_publicly,
                u.profile_image_url,
                u.last_login_at,
                u.phone,
                u.created_at,
                u.preferred_workspace,
                bp.name AS business_partner_name,
                bp.dashboard_title,
                bp.enabled_modules AS tenant_modules,
                bp.default_workspace AS tenant_default_workspace,
                bp.sales_plan AS tenant_sales_plan,
                bp.sales_subscription_status AS tenant_sales_subscription_status,
                bp.sales_trial_ends_on AS tenant_sales_trial_ends_on,
                CASE WHEN bp.sales_subscription_status = 'trial'
                    THEN GREATEST(bp.sales_trial_ends_on - CURRENT_DATE, 0)
                    ELSE NULL END AS tenant_sales_trial_days_remaining,
                CASE WHEN bp.sales_subscription_status = 'active'
                    OR (bp.sales_subscription_status = 'trial' AND bp.sales_trial_ends_on >= CURRENT_DATE)
                    THEN TRUE ELSE FALSE END AS tenant_sales_access_active,

                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = u.business_partner_id
                ) AS regions
                
             FROM users u
             LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
             WHERE u.id = $1`,
            [userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        res.json(withMembershipExpiry(result.rows[0]));
    } catch (err) {
        console.error('Fehler beim Abrufen des Profils:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const body = req.body || {};
        const phone = body.phone;

        // 1. Telefonnummer Validierung (Einfach & Sinnvoll)
        if (phone) {
            const cleanPhone = phone.replace(/[^0-9+]/g, '');
            // Erlaubt +, -, Leerzeichen, Klammern und Ziffern. Mindestens 5 Zeichen.
            const phoneRegex = /^[+]?[0-9\s\-()]{5,30}$/;

            if (cleanPhone.length < 5 || !phoneRegex.test(phone.trim())) {
                return res.status(400).json({ 
                    message: 'Ungültige Telefonnummer. Bitte verwenden Sie nur Ziffern, +, - oder Leerzeichen.' 
                });
            }
        }

        const { rows } = await db.query(
            'SELECT password_hash, newsletter_opt_in FROM users WHERE id = $1',
            [userId]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });

        if (body.newsletter_opt_in === true && rows[0].newsletter_opt_in !== true) {
            return res.status(400).json({
                message: 'Die Newsletter-Anmeldung muss über den Bestätigungslink (Double-Opt-In) erfolgen.'
            });
        }
        if (body.briefing_email_enabled === true && rows[0].newsletter_opt_in !== true) {
            return res.status(400).json({
                message: 'Bitte bestätigen Sie zuerst die Newsletter-Anmeldung per E-Mail.'
            });
        }
        if (body.member_newsletter_enabled === true && rows[0].newsletter_opt_in !== true) {
            return res.status(400).json({
                message: 'Bitte bestätigen Sie zuerst die Newsletter-Anmeldung per E-Mail.'
            });
        }

        const allowedFields = [
            'first_name', 'last_name', 'organization_name', 'linkedin_url',
            'article_score_min', 'article_score_max', 'preferred_theme',
            'preferred_language', 'newsletter_opt_in', 'briefing_email_enabled',
            'member_newsletter_enabled', 'phone', 'public_profile_enabled',
            'show_email_publicly', 'show_phone_publicly',
            'show_organization_publicly', 'show_linkedin_publicly',
            'preferred_workspace'
        ];
        const booleanFields = new Set([
            'newsletter_opt_in', 'briefing_email_enabled', 'member_newsletter_enabled',
            'public_profile_enabled', 'show_email_publicly', 'show_phone_publicly',
            'show_organization_publicly', 'show_linkedin_publicly'
        ]);
        const assignments = [];
        const values = [];
        const addValue = (column, value) => {
            values.push(value);
            assignments.push(`${column} = $${values.length}`);
        };

        for (const field of allowedFields) {
            if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
            let value = body[field];
            if (booleanFields.has(field) && typeof value !== 'boolean') {
                return res.status(400).json({ message: `Ungültiger Wert für ${field}.` });
            }
            if (field === 'phone') value = value ? String(value).trim() : null;
            if (field === 'preferred_workspace') {
                value = String(value || '').trim().toLowerCase();
                if (!['content', 'sales'].includes(value)) {
                    return res.status(400).json({ message: 'Ungültiger Arbeitsbereich.' });
                }
                const moduleResult = await db.query(
                    `SELECT bp.enabled_modules
                     FROM users app_user
                     LEFT JOIN business_partners bp ON bp.id = app_user.business_partner_id
                     WHERE app_user.id = $1`,
                    [userId]
                );
                const enabledModules = moduleResult.rows[0]?.enabled_modules || ['content'];
                if (!enabledModules.includes(value) && req.user.role !== 'admin') {
                    return res.status(403).json({ message: 'Dieser Arbeitsbereich ist für den Mandanten nicht freigeschaltet.' });
                }
            }
            addValue(field, value);
        }

        if (body.newsletter_opt_in === false) {
            addValue('briefing_email_enabled', false);
            addValue('member_newsletter_enabled', false);
            assignments.push('newsletter_unsubscribed_at = CURRENT_TIMESTAMP');
        }

        if (body.password && String(body.password).trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            addValue('password_hash', await bcrypt.hash(String(body.password), salt));
            assignments.push('auth_version = auth_version + 1');
        }

        if (assignments.length > 0) {
            values.push(userId);
            await db.query(
                `UPDATE users SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $${values.length}`,
                values
            );
        }
        
        // 3. Profil zurückgeben
        const profileResult = await db.query(
            `SELECT
                u.id, u.username, u.email, u.first_name, u.last_name, u.organization_name,
                u.linkedin_url, u.membership_level, u.role, u.business_partner_id,
                u.article_score_min, u.article_score_max,
                u.contribution_score, u.newsletter_opt_in, u.briefing_email_enabled,
                u.member_newsletter_enabled, u.active_until,
                u.newsletter_opt_in_confirmed_at,
                u.public_profile_enabled,
                u.show_email_publicly,
                u.show_phone_publicly,
                u.show_organization_publicly,
                u.show_linkedin_publicly,
                u.phone,
                u.preferred_workspace,
                bp.name AS business_partner_name,
                bp.dashboard_title,
                bp.enabled_modules AS tenant_modules,
                bp.default_workspace AS tenant_default_workspace,
                bp.sales_plan AS tenant_sales_plan,
                bp.sales_subscription_status AS tenant_sales_subscription_status,
                bp.sales_trial_ends_on AS tenant_sales_trial_ends_on,
                CASE WHEN bp.sales_subscription_status = 'trial'
                    THEN GREATEST(bp.sales_trial_ends_on - CURRENT_DATE, 0)
                    ELSE NULL END AS tenant_sales_trial_days_remaining,
                CASE WHEN bp.sales_subscription_status = 'active'
                    OR (bp.sales_subscription_status = 'trial' AND bp.sales_trial_ends_on >= CURRENT_DATE)
                    THEN TRUE ELSE FALSE END AS tenant_sales_access_active,
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
             LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
             WHERE u.id = $1`,
            [userId]
        );

        res.json(withMembershipExpiry(profileResult.rows[0]));
        
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
    const { id: userId } = req.user;
    const { widgetType } = req.query;

    if (!widgetType) {
        return res.status(400).json({ message: 'Widget-Typ ist erforderlich.' });
    }

    try {
        const { rows } = await db.query(
            `
            SELECT *
            FROM user_favorites
            WHERE user_id = $1
              AND favorite_type = $2
            ORDER BY updated_at DESC, created_at DESC
            `,
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
        return res.status(400).json({
            message: 'Widget-Typ und Favorit mit external_id sind erforderlich.'
        });
    }

    try {
        const favoriteType = String(widgetType).trim();
        const external_id = String(favorite.external_id).trim();

        const name = favorite.name ?? null;
        const country_code = favorite.country_code ? String(favorite.country_code).toUpperCase() : null;
        const brand = favorite.brand ?? null;
        const street = favorite.street ?? null;
        const house_no = favorite.house_no ?? null;
        const post_code = favorite.post_code ?? null;
        const city = favorite.city ?? null;

        const lat = favorite.lat !== undefined && favorite.lat !== null ? Number(favorite.lat) : null;
        const lng = favorite.lng !== undefined && favorite.lng !== null ? Number(favorite.lng) : null;

        const last_diesel = favorite.last_diesel !== undefined && favorite.last_diesel !== null
            ? Number(favorite.last_diesel)
            : null;

        const last_e5 = favorite.last_e5 !== undefined && favorite.last_e5 !== null
            ? Number(favorite.last_e5)
            : null;

        const last_e10 = favorite.last_e10 !== undefined && favorite.last_e10 !== null
            ? Number(favorite.last_e10)
            : null;

        const last_status = favorite.last_status ?? null;
        const last_price_ts = favorite.last_price_ts ? new Date(favorite.last_price_ts) : new Date();

        const provider = favorite.provider ?? null;

        const operator_name = favorite.operator_name ?? null;
        const charge_point_count = favorite.charge_point_count !== undefined && favorite.charge_point_count !== null
            ? Number(favorite.charge_point_count)
            : null;

        const power_kw = favorite.power_kw !== undefined && favorite.power_kw !== null
            ? Number(favorite.power_kw)
            : null;

        const connector_types = Array.isArray(favorite.connector_types)
            ? favorite.connector_types
            : null;

        const query = `
            INSERT INTO user_favorites (
                user_id,
                favorite_type,
                external_id,
                name,
                country_code,
                brand,
                street,
                house_no,
                post_code,
                city,
                lat,
                lng,
                last_diesel,
                last_e5,
                last_e10,
                last_status,
                last_price_ts,
                provider,
                operator_name,
                charge_point_count,
                power_kw,
                connector_types,
                created_at,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18,
                $19, $20, $21, $22,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (user_id, favorite_type, external_id)
            DO UPDATE SET
                name               = EXCLUDED.name,
                country_code       = EXCLUDED.country_code,
                brand              = EXCLUDED.brand,
                street             = EXCLUDED.street,
                house_no           = EXCLUDED.house_no,
                post_code          = EXCLUDED.post_code,
                city               = EXCLUDED.city,
                lat                = EXCLUDED.lat,
                lng                = EXCLUDED.lng,
                last_diesel        = EXCLUDED.last_diesel,
                last_e5            = EXCLUDED.last_e5,
                last_e10           = EXCLUDED.last_e10,
                last_status        = EXCLUDED.last_status,
                last_price_ts      = EXCLUDED.last_price_ts,
                provider           = EXCLUDED.provider,
                operator_name      = EXCLUDED.operator_name,
                charge_point_count = EXCLUDED.charge_point_count,
                power_kw           = EXCLUDED.power_kw,
                connector_types    = EXCLUDED.connector_types,
                updated_at         = CURRENT_TIMESTAMP
            RETURNING *;
        `;

        const params = [
            userId,
            favoriteType,
            external_id,
            name,
            country_code,
            brand,
            street,
            house_no,
            post_code,
            city,
            Number.isFinite(lat) ? lat : null,
            Number.isFinite(lng) ? lng : null,
            Number.isFinite(last_diesel) ? last_diesel : null,
            Number.isFinite(last_e5) ? last_e5 : null,
            Number.isFinite(last_e10) ? last_e10 : null,
            last_status,
            last_price_ts,
            provider,
            operator_name,
            Number.isFinite(charge_point_count) ? charge_point_count : null,
            Number.isFinite(power_kw) ? power_kw : null,
            connector_types
        ];

        const { rows } = await db.query(query, params);

        res.status(201).json({
            message: 'Favorit gespeichert.',
            favorite: rows[0]
        });
    } catch (err) {
        console.error('Fehler beim Hinzufügen des Favoriten:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};


exports.removeFavorite = async (req, res) => {
    const { id: userId } = req.user;
    const { externalId } = req.params;
    const { widgetType } = req.query;

    if (!widgetType || !externalId) {
        return res.status(400).json({
            message: 'Widget-Typ und Favoriten-ID sind erforderlich.'
        });
    }

    try {
        await db.query(
            `
            DELETE FROM user_favorites
            WHERE user_id = $1
              AND favorite_type = $2
              AND external_id = $3
            `,
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


exports.getPublicUserProfile = async (req, res) => {
    const { userId } = req.params;

    if (!userId || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId)) {
        return res.status(400).json({ message: 'Ungültige User-ID.' });
    }

    try {
        const query = `
            SELECT 
                u.id,
                u.first_name,
                u.last_name,
                u.username,
                CASE WHEN u.show_organization_publicly THEN u.organization_name ELSE NULL END AS organization_name,
                u.role,
                u.membership_level,
                CASE WHEN u.show_linkedin_publicly THEN u.linkedin_url ELSE NULL END AS linkedin_url,
                u.profile_image_url,
                u.contribution_score,
                u.created_at as member_since,
                CASE WHEN u.show_email_publicly THEN u.email ELSE NULL END AS email,
                CASE WHEN u.show_phone_publicly THEN u.phone ELSE NULL END AS phone,
                bp.logo_url as bp_logo_url,
                bp.name as bp_name
            FROM users u
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
            WHERE u.id = $1
              AND u.is_active = TRUE
              AND u.public_profile_enabled = TRUE
              AND (u.active_until IS NULL OR (u.active_until AT TIME ZONE 'Europe/Vienna')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Vienna')::date)
              AND COALESCE(bp.is_active, TRUE) = TRUE
              AND (bp.subscription_end_date IS NULL OR bp.subscription_end_date >= CURRENT_DATE)
        `;
        
        const { rows } = await db.query(query, [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Profil nicht verfügbar.' });
        }

        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.json(rows[0]);

    } catch (err) {
        console.error('Fehler beim Abrufen des öffentlichen Profils:', err.message);
        res.status(500).send('Serverfehler');
    }
};
