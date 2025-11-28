// backend/controllers/notificationController.js
const db = require('../config/db');

// 1. Benachrichtigungen abrufen (für die Glocke im Frontend)
exports.getNotifications = async (req, res) => {
    const { id: userId } = req.user;
    const { limit = 20 } = req.query;

    try {
        // Liste der Benachrichtigungen laden
        const query = `
            SELECT * FROM user_notifications 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2
        `;
        const { rows } = await db.query(query, [userId, limit]);
        
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

// 3. INTERNE Helper-Funktion
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