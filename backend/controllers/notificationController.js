// backend/controllers/notificationController.js
const db = require('../config/db');

const SYSTEM_NOTIFICATION_TYPES = [
    'system_update_reload',
    'system_update_info',
    'system_update_admin'
];

const isActiveUserClause = `
    is_active = TRUE
    AND (active_until IS NULL OR active_until > NOW())
`;

const sanitizeText = (value, fallback = '') => {
    if (value === null || value === undefined) return fallback;
    return String(value).trim() || fallback;
};

const normalizeTargetRoles = (roles) => {
    if (!roles) return null;
    if (Array.isArray(roles)) {
        const cleaned = roles.map((role) => String(role).trim()).filter(Boolean);
        return cleaned.length > 0 ? cleaned : null;
    }
    if (typeof roles === 'string') {
        const cleaned = roles.split(',').map((role) => role.trim()).filter(Boolean);
        return cleaned.length > 0 ? cleaned : null;
    }
    return null;
};

// 1. Benachrichtigungen abrufen (für die Glocke im Frontend)
exports.getNotifications = async (req, res) => {
    const { id: userId } = req.user;
    const { limit = 20 } = req.query;

    try {
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

        // Liste der Benachrichtigungen laden
        const query = `
            SELECT
                id,
                user_id,
                type,
                reference_id,
                title,
                message,
                is_read,
                created_at,
                CASE
                    WHEN type = ANY($3::text[]) THEN TRUE
                    ELSE FALSE
                END AS is_system_notification
            FROM user_notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `;
        const { rows } = await db.query(query, [userId, safeLimit, SYSTEM_NOTIFICATION_TYPES]);
        
        // Anzahl der ungelesenen Nachrichten zählen (für den roten Badge)
        const countQuery = `SELECT COUNT(*) FROM user_notifications WHERE user_id = $1 AND is_read = FALSE`;
        const countRes = await db.query(countQuery, [userId]);
        
        res.json({
            items: rows,
            unreadCount: parseInt(countRes.rows[0].count, 10)
        });
    } catch (err) {
        console.error('Fehler beim Laden der Benachrichtigungen:', err.message);
        res.status(500).json({ message: 'Fehler beim Laden der Benachrichtigungen.' });
    }
};

// 2. Als gelesen markieren (Einzeln oder "Alle")
exports.markAsRead = async (req, res) => {
    const { id: userId } = req.user;
    const { notificationId } = req.body; // Optional: Wenn leer, werden ALLE markiert

    try {
        if (notificationId) {
            // Einzelne Nachricht als gelesen markieren
            await db.query(
                'UPDATE user_notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
                [notificationId, userId]
            );
        } else {
            // Alle ungelesenen Nachrichten des Users als gelesen markieren (z.B. beim Öffnen des Menüs)
            await db.query(
                'UPDATE user_notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
                [userId]
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Fehler beim Aktualisieren der Benachrichtigungen:', err.message);
        res.status(500).json({ message: 'Fehler beim Aktualisieren.' });
    }
};

// 3. Admin-Funktion: Systemupdate-Hinweise erzeugen/ersetzen
exports.createSystemUpdateNotifications = async (req, res) => {
    const { role } = req.user || {};

    if (role !== 'admin') {
        return res.status(403).json({ message: 'Nur Admins dürfen Systemhinweise erstellen.' });
    }

    const {
        title,
        message,
        version,
        targetRoles,
        requiresReload = true,
        adminMessage
    } = req.body || {};

    const safeVersion = sanitizeText(version, new Date().toISOString());
    const safeTitle = sanitizeText(title, requiresReload ? 'Neue Version verfügbar' : 'Systemhinweis');
    const safeMessage = sanitizeText(
        message,
        requiresReload
            ? 'Bitte aktualisieren Sie die Seite, um die neueste Oberfläche zu laden.'
            : 'Das System wurde aktualisiert.'
    );
    const safeAdminMessage = sanitizeText(
        adminMessage,
        `Letztes Systemupdate: ${new Date().toLocaleString('de-DE')}\nVersion: ${safeVersion}\nStatus: erfolgreich`
    );
    const roles = normalizeTargetRoles(targetRoles);
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // Keine Historie gewünscht: alte Systemupdate-Hinweise ersetzen.
        await client.query(
            `DELETE FROM user_notifications WHERE type = ANY($1::text[])`,
            [SYSTEM_NOTIFICATION_TYPES]
        );

        const type = requiresReload ? 'system_update_reload' : 'system_update_info';
        const roleFilter = roles ? 'AND role = ANY($4::text[])' : '';
        const userParams = roles ? [type, safeTitle, safeMessage, roles] : [type, safeTitle, safeMessage];

        const insertUserNotifications = `
            INSERT INTO user_notifications (user_id, type, title, message)
            SELECT id, $1, $2, $3
            FROM users
            WHERE ${isActiveUserClause}
              AND role <> 'admin'
              ${roleFilter}
        `;
        const userResult = await client.query(insertUserNotifications, userParams);

        // Admins bekommen einen technischeren Hinweis mit letztem Update/Version.
        const adminResult = await client.query(
            `
            INSERT INTO user_notifications (user_id, type, title, message)
            SELECT id, 'system_update_admin', $1, $2
            FROM users
            WHERE ${isActiveUserClause}
              AND role = 'admin'
            `,
            ['Systemupdate erfolgreich', safeAdminMessage]
        );

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            createdForUsers: userResult.rowCount,
            createdForAdmins: adminResult.rowCount,
            version: safeVersion
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Erstellen der Systemupdate-Benachrichtigungen:', err.message);
        res.status(500).json({ message: 'Systemhinweise konnten nicht erstellt werden.' });
    } finally {
        client.release();
    }
};

// 4. INTERNE Helper-Funktion
// Diese Funktion wird nicht per Route aufgerufen, sondern von anderen Controllern (z.B. communityController) importiert.
exports.createNotificationInternal = async (userId, type, title, message, referenceId, client = null) => {
    const query = `
        INSERT INTO user_notifications (user_id, type, title, message, reference_id)
        VALUES ($1, $2, $3, $4, $5)
    `;
    const values = [userId, type, title, message, referenceId || null];
    
    try {
        if (client) {
            // Wenn wir bereits in einer Transaktion sind (z.B. beim Post-Erstellen), nutzen wir den Client
            await client.query(query, values);
        } else {
            // Sonst nehmen wir den Standard-Pool
            await db.query(query, values);
        }
    } catch (err) {
        // Fehler beim Erstellen einer Notifikation sollten nicht den ganzen Prozess (z.B. Kommentar speichern) abbrechen
        console.error('Fehler beim Erstellen der internen Benachrichtigung:', err.message);
    }
};
