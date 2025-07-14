// backend/controllers/adminAdvertisementsController.js
const db = require('../config/db');

// GET all advertisements
exports.getAllAdvertisements = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT a.*, bp.name as business_partner_name 
            FROM advertisements a
            LEFT JOIN business_partners bp ON a.business_partner_id = bp.id
            ORDER BY a.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching advertisements:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE a new advertisement
exports.createAdvertisement = async (req, res) => {
    const { business_partner_id, content, is_active, start_date, end_date } = req.body;
    if (!content) {
        return res.status(400).json({ message: 'Content is required.' });
    }
    try {
        const result = await db.query(
            `INSERT INTO advertisements (business_partner_id, content, is_active, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [business_partner_id || null, content, is_active, start_date || null, end_date || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating advertisement:', err.message);
        res.status(500).send('Server error');
    }
};

// UPDATE an advertisement
exports.updateAdvertisement = async (req, res) => {
    const { id } = req.params;
    const { business_partner_id, content, is_active, start_date, end_date } = req.body;
    if (!content) {
        return res.status(400).json({ message: 'Content is required.' });
    }
    try {
        const result = await db.query(
            `UPDATE advertisements SET 
                business_partner_id = $1, content = $2, is_active = $3, 
                start_date = $4, end_date = $5 
             WHERE id = $6 RETURNING *`,
            [business_partner_id || null, content, is_active, start_date || null, end_date || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Advertisement not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating advertisement:', err.message);
        res.status(500).send('Server error');
    }
};

// DELETE an advertisement
exports.deleteAdvertisement = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('DELETE FROM advertisements WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Advertisement not found.' });
        }
        res.status(200).json({ message: 'Advertisement deleted successfully.' });
    } catch (err) {
        console.error('Error deleting advertisement:', err.message);
        res.status(500).send('Server error');
    }
};
