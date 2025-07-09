// backend/controllers/adminBpWidgetAccessController.js
const db = require('../config/db');

const isValidUUID = (uuid) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// GET all business partner widget access entries
exports.getAllBpWidgetAccess = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT bpwa.business_partner_id, bp.name AS business_partner_name,
                    bpwa.widget_type_id, wt.name AS widget_type_name,
                    bpwa.access_granted_at
             FROM business_partner_widget_access bpwa
             JOIN business_partners bp ON bpwa.business_partner_id = bp.id
             JOIN widget_types wt ON bpwa.widget_type_id = wt.id
             ORDER BY bp.name, wt.name ASC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all BP widget access entries:', err.message);
        res.status(500).send('Server error');
    }
};

// GET widget access for a specific business partner
exports.getBpWidgetAccessByBpId = async (req, res) => {
    const { bpId } = req.params;
    if (!isValidUUID(bpId)) return res.status(400).json({ message: 'Invalid Business Partner ID format.' });

    try {
        const result = await db.query(
            `SELECT bpwa.business_partner_id, bp.name AS business_partner_name,
                    bpwa.widget_type_id, wt.name AS widget_type_name,
                    bpwa.access_granted_at
             FROM business_partner_widget_access bpwa
             JOIN business_partners bp ON bpwa.business_partner_id = bp.id
             JOIN widget_types wt ON bpwa.widget_type_id = wt.id
             WHERE bpwa.business_partner_id = $1
             ORDER BY wt.name ASC`,
            [bpId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching BP widget access by BP ID:', err.message);
        res.status(500).send('Server error');
    }
};

// GRANT widget access (CREATE entry)
exports.grantWidgetAccess = async (req, res) => {
    const { business_partner_id, widget_type_id } = req.body;

    if (!business_partner_id || !widget_type_id) {
        return res.status(400).json({ message: 'Business Partner ID and Widget Type ID are required.' });
    }
    if (!isValidUUID(business_partner_id) || !isValidUUID(widget_type_id)) {
        return res.status(400).json({ message: 'Invalid ID format.' });
    }

    try {
        const newAccess = await db.query(
            `INSERT INTO business_partner_widget_access (business_partner_id, widget_type_id)
             VALUES ($1, $2) RETURNING *`,
            [business_partner_id, widget_type_id]
        );
        res.status(201).json(newAccess.rows[0]);
    } catch (err) {
        console.error('Error granting widget access:', err.message);
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'Widget access already granted for this Business Partner and Widget Type.' });
        }
        res.status(500).send('Server error');
    }
};

// REVOKE widget access (DELETE entry)
exports.revokeWidgetAccess = async (req, res) => {
    const { business_partner_id, widget_type_id } = req.body; // Use body for DELETE as params can be tricky with composite keys

    if (!business_partner_id || !widget_type_id) {
        return res.status(400).json({ message: 'Business Partner ID and Widget Type ID are required.' });
    }
    if (!isValidUUID(business_partner_id) || !isValidUUID(widget_type_id)) {
        return res.status(400).json({ message: 'Invalid ID format.' });
    }

    try {
        const result = await db.query(
            'DELETE FROM business_partner_widget_access WHERE business_partner_id = $1 AND widget_type_id = $2 RETURNING *',
            [business_partner_id, widget_type_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Widget access not found for revocation.' });
        }
        res.json({ message: 'Widget access revoked successfully', revoked: result.rows[0] });
    } catch (err) {
        console.error('Error revoking widget access:', err.message);
        res.status(500).send('Server error');
    }
};