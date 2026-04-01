// backend/controllers/feedbackController.js
const db = require('../config/db');

// Alle Feedback-Einträge für das öffentliche Board abrufen
exports.getFeedbackItems = async (req, res) => {
    const { id: userId } = req.user;
    try {
        // WICHTIG: LEFT JOIN, da user_id jetzt NULL sein kann (bei Leads)
        // WHERE-Filter, damit Sales-Leads ('demo_request') nicht auf dem Community-Board landen!
        const query = `
            SELECT 
                fi.*,
                COALESCE(u.username, fi.name) AS author_username,
                COALESCE(u.organization_name, fi.organization) AS organization_name,
                (SELECT COUNT(*) FROM feedback_votes fv WHERE fv.feedback_item_id = fi.id) AS votes,
                EXISTS(SELECT 1 FROM feedback_votes fv WHERE fv.feedback_item_id = fi.id AND fv.user_id = $1) AS has_voted
            FROM feedback_items fi
            LEFT JOIN users u ON fi.user_id = u.id
            WHERE fi.type IN ('bug', 'suggestion', 'idea')
            ORDER BY fi.created_at DESC;
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching feedback items:', err.message);
        res.status(500).send('Server error');
    }
};

// Einen neuen Feedback-Eintrag erstellen (Intern aus dem Dashboard)
exports.createFeedbackItem = async (req, res) => {
    const { id: userId, business_partner_id: bpId } = req.user;
    const { title, description, type, widget_type_key } = req.body;

    if (!title || !description || !type) {
        return res.status(400).json({ message: 'Title, description, and type are required.' });
    }

    // IP-Adresse und User-Agent für Analytics/Spamschutz erfassen
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'];

    // Client für die Transaktion aus dem Pool holen
    const client = await db.connect();

    try {
        // Transaktion starten
        await client.query('BEGIN');

        // 1. Feedback-Eintrag erstellen inkl. IP und BP-ID
        const insertFeedbackQuery = `
            INSERT INTO feedback_items 
            (user_id, business_partner_id, title, description, type, widget_type_key, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        const feedbackResult = await client.query(insertFeedbackQuery, [
            userId, 
            bpId || null, 
            title, 
            description, 
            type, 
            widget_type_key || null, 
            ipAddress, 
            userAgent
        ]);
        const newFeedbackItem = feedbackResult.rows[0];

        // 2. Gamification: Dem Nutzer 5 Punkte gutschreiben
        await client.query(
            'UPDATE users SET contribution_score = contribution_score + 5 WHERE id = $1',
            [userId]
        );

        // 3. Log-Eintrag für die Punkteänderung erstellen
        const logDescription = `Punkte für neue Meldung: "${newFeedbackItem.title}"`;
        await client.query(
            'INSERT INTO user_score_logs (user_id, points_change, action_type, description, reference_id) VALUES ($1, 5, \'FEEDBACK_SUBMITTED\', $2, $3)',
            [userId, logDescription, newFeedbackItem.id]
        );

        // Transaktion erfolgreich abschließen
        await client.query('COMMIT');

        res.status(201).json(newFeedbackItem);

    } catch (err) {
        // Bei einem Fehler die Transaktion zurückrollen
        await client.query('ROLLBACK');
        console.error('Error creating feedback item with gamification:', err.message);
        res.status(500).send('Server error');
    } finally {
        // WICHTIG: Den Client wieder für den Pool freigeben
        client.release();
    }
};

// Für einen Feedback-Eintrag abstimmen (oder Stimme zurückziehen)
exports.toggleVote = async (req, res) => {
    const { id: userId } = req.user;
    const { itemId } = req.params;
    try {
        const existingVote = await db.query(
            'SELECT * FROM feedback_votes WHERE user_id = $1 AND feedback_item_id = $2',
            [userId, itemId]
        );

        if (existingVote.rows.length > 0) {
            // Vote exists, so remove it
            await db.query(
                'DELETE FROM feedback_votes WHERE user_id = $1 AND feedback_item_id = $2',
                [userId, itemId]
            );
            res.json({ message: 'Vote removed.' });
        } else {
            // Vote does not exist, so add it
            await db.query(
                'INSERT INTO feedback_votes (user_id, feedback_item_id) VALUES ($1, $2)',
                [userId, itemId]
            );
            res.json({ message: 'Vote added.' });
        }
    } catch (err) {
        console.error('Error toggling vote:', err.message);
        res.status(500).send('Server error');
    }
};

// Status durch Admins aktualisieren
exports.updateFeedbackStatus = async (req, res) => {
    const { itemId } = req.params;
    const { status } = req.body;
    
    // NEU: 'in_progress' und 'resolved' hinzugefügt!
    const validStatuses = ['new', 'in_review', 'planned', 'done', 'rejected', 'in_progress', 'resolved'];

    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status provided.' });
    }

    try {
        const result = await db.query(
            'UPDATE feedback_items SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status, itemId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Feedback item not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating feedback status:', err.message);
        res.status(500).send('Server error');
    }
};