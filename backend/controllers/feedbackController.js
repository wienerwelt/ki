// backend/controllers/feedbackController.js
const db = require('../config/db');

// Alle Feedback-Einträge für das öffentliche Board abrufen
exports.getFeedbackItems = async (req, res) => {
    const { id: userId } = req.user;
    try {
        // KORREKTUR: Die Abfrage lädt jetzt auch den 'organization_name' des Autors mit.
        const query = `
            SELECT 
                fi.*,
                u.username AS author_username,
                u.organization_name, -- NEU
                (SELECT COUNT(*) FROM feedback_votes fv WHERE fv.feedback_item_id = fi.id) AS votes,
                EXISTS(SELECT 1 FROM feedback_votes fv WHERE fv.feedback_item_id = fi.id AND fv.user_id = $1) AS has_voted
            FROM feedback_items fi
            JOIN users u ON fi.user_id = u.id
            ORDER BY created_at DESC;
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching feedback items:', err.message);
        res.status(500).send('Server error');
    }
};

// Einen neuen Feedback-Eintrag erstellen
exports.createFeedbackItem = async (req, res) => {
    const { id: userId } = req.user;
    const { title, description, type, widget_type_key } = req.body;
    if (!title || !description || !type) {
        return res.status(400).json({ message: 'Title, description, and type are required.' });
    }
    try {
        const query = `
            INSERT INTO feedback_items (user_id, title, description, type, widget_type_key)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const result = await db.query(query, [userId, title, description, type, widget_type_key]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating feedback item:', err.message);
        res.status(500).send('Server error');
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

exports.updateFeedbackStatus = async (req, res) => {
    const { itemId } = req.params;
    const { status } = req.body;
    const validStatuses = ['new', 'in_review', 'planned', 'done', 'rejected'];

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
