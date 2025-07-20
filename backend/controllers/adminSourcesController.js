// backend/controllers/adminSourcesController.js

const db = require('../config/db');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// @desc    Alle Quellen für Admins abrufen
// @route   GET /api/admin/sources
// @access  Admin
exports.getAllSourcesAdmin = async (req, res) => {
    try {
        const query = `
            SELECT s.*, u.username as suggested_by, c.name as category_name
            FROM sources s
            LEFT JOIN users u ON s.suggested_by_user_id = u.id
            LEFT JOIN categories c ON s.category_id = c.id
            ORDER BY s.created_at DESC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all sources for admin:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Details einer einzelnen Quelle abrufen
// @route   GET /api/admin/sources/:id
// @access  Admin
exports.getSourceDetailsAdmin = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const result = await db.query('SELECT * FROM sources WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching source by ID for admin:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Status einer Quelle aktualisieren
// @route   PUT /api/admin/sources/:id/status
// @access  Admin
exports.updateSourceStatus = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const { status } = req.body;
    if (!['approved', 'rejected', 'pending_review'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status provided.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Status der Quelle aktualisieren und die ID des Vorschlagenden zurückgeben
        const updateResult = await client.query(
            'UPDATE sources SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING suggested_by_user_id',
            [status, id]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        
        const { suggested_by_user_id } = updateResult.rows[0];

        // 2. Wenn Status 'approved' ist und ein Nutzer die Quelle vorgeschlagen hat, Punkte vergeben
        if (status === 'approved' && suggested_by_user_id) {
            await client.query(
                'UPDATE users SET contribution_score = contribution_score + 5 WHERE id = $1',
                [suggested_by_user_id]
            );
        }

        await client.query('COMMIT');
        res.json({ message: `Source status updated to ${status}` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating source status:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// @desc    Eine Quelle löschen
// @route   DELETE /api/admin/sources/:id
// @access  Admin
exports.deleteSource = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        // Die ON DELETE CASCADE Regel in der DB löscht zugehörige votes und reports automatisch.
        const result = await db.query('DELETE FROM sources WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        res.status(200).json({ message: 'Source deleted successfully' });
    } catch (err) {
        console.error('Error deleting source:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Alle Meldungen zu Quellen abrufen
// @route   GET /api/admin/sources/reports
// @access  Admin
exports.getSourceReports = async (req, res) => {
    try {
        const query = `
            SELECT r.*, s.url as source_url, u.username as reported_by
            FROM source_reports r
            JOIN sources s ON r.source_id = s.id
            JOIN users u ON r.reported_by_user_id = u.id
            ORDER BY r.created_at DESC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching source reports:', err.message);
        res.status(500).send('Server error');
    }
};