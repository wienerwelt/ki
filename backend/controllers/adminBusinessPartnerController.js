// backend/controllers/adminBusinessPartnerController.js
const db = require('../config/db');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// GET all business partners
exports.getAllBusinessPartners = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                bp.id, bp.name, bp.dashboard_title, bp.address, bp.logo_url, 
                bp.subscription_start_date, bp.subscription_end_date, bp.color_scheme_id, 
                bp.is_active, bp.created_at, bp.updated_at, bp.url_businesspartner,
                bp.level_1_name, bp.level_2_name, bp.level_3_name,
                cs.name AS color_scheme_name, cs.primary_color,
                (SELECT COUNT(*) FROM users u WHERE u.business_partner_id = bp.id) AS user_count,
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = bp.id) AS regions
             FROM business_partners bp
             LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
             ORDER BY bp.name ASC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all business partners:', err.message);
        res.status(500).send('Server error');
    }
};

// GET a single business partner by ID
exports.getBusinessPartnerById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Business Partner ID format.' });

    try {
        const result = await db.query(
            `SELECT bp.*, cs.name AS color_scheme_name,
               (SELECT COALESCE(json_agg(
                   jsonb_build_object('id', r.id, 'name', r.name, 'is_default', bpr.is_default)
                   ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                FROM business_partner_regions bpr
                JOIN regions r ON bpr.region_id = r.id
                WHERE bpr.business_partner_id = bp.id) as regions
             FROM business_partners bp
             LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
             WHERE bp.id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching business partner by ID:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE new business partner
exports.createBusinessPartner = async (req, res) => {
    const { 
        name, address, logo_url, subscription_start_date, subscription_end_date, 
        color_scheme_id, is_active, url_businesspartner, region_ids = [], 
        dashboard_title, level_1_name, level_2_name, level_3_name,
        default_region_id // NEU
    } = req.body;

    if (!name) return res.status(400).json({ message: 'Name is required.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const bpResult = await client.query(
            `INSERT INTO business_partners (
                name, address, logo_url, subscription_start_date, subscription_end_date, 
                color_scheme_id, is_active, url_businesspartner, dashboard_title,
                level_1_name, level_2_name, level_3_name
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
                name, address, logo_url, subscription_start_date, subscription_end_date, 
                color_scheme_id || null, is_active, url_businesspartner, dashboard_title,
                level_1_name, level_2_name, level_3_name
            ]
        );
        const newBp = bpResult.rows[0];

        if (region_ids && region_ids.length > 0) {
            for (const region_id of region_ids) {
                const isDefault = region_id === default_region_id;
                await client.query(
                    'INSERT INTO business_partner_regions (business_partner_id, region_id, is_default) VALUES ($1, $2, $3)',
                    [newBp.id, region_id, isDefault]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json(newBp);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating business partner:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// UPDATE existing business partner
exports.updateBusinessPartner = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const { 
        name, address, logo_url, subscription_start_date, subscription_end_date, 
        color_scheme_id, is_active, url_businesspartner, region_ids = [], 
        dashboard_title, level_1_name, level_2_name, level_3_name,
        default_region_id // NEU
    } = req.body;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const updatedBpResult = await client.query(
            `UPDATE business_partners SET
                name = $1, address = $2, logo_url = $3, subscription_start_date = $4,
                subscription_end_date = $5, color_scheme_id = $6, is_active = $7,
                url_businesspartner = $8, dashboard_title = $9, level_1_name = $10,
                level_2_name = $11, level_3_name = $12, updated_at = CURRENT_TIMESTAMP
             WHERE id = $13 RETURNING *`,
            [
                name, address, logo_url, subscription_start_date, subscription_end_date, 
                color_scheme_id || null, is_active, url_businesspartner, dashboard_title, 
                level_1_name, level_2_name, level_3_name, id
            ]
        );
        if (updatedBpResult.rows.length === 0) throw new Error('Business Partner not found.');

        await client.query('DELETE FROM business_partner_regions WHERE business_partner_id = $1', [id]);

        if (region_ids && region_ids.length > 0) {
            for (const region_id of region_ids) {
                const isDefault = region_id === default_region_id;
                await client.query(
                    'INSERT INTO business_partner_regions (business_partner_id, region_id, is_default) VALUES ($1, $2, $3)',
                    [id, region_id, isDefault]
                );
            }
        }

        await client.query('COMMIT');
        res.json(updatedBpResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating business partner:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// DELETE business partner
exports.deleteBusinessPartner = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Business Partner ID format.' });

    try {
        const result = await db.query('DELETE FROM business_partners WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner not found.' });
        }
        res.json({ message: 'Business Partner deleted successfully' });
    } catch (err) {
        console.error('Error deleting business partner:', err.message);
        res.status(500).send('Server error');
    }
};

// GET all color schemes
exports.getAllColorSchemes = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, primary_color FROM color_schemes ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all color schemes:', err.message);
        res.status(500).send('Server error');
    }
};

// GET all regions
exports.getAllRegions = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name FROM regions ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all regions:', err.message);
        res.status(500).send('Server error');
    }
};

// GET user stats for a business partner
exports.getBusinessPartnerUserStats = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const statsQuery = `
            SELECT 
                is_active, 
                COUNT(*) as count 
            FROM users 
            WHERE business_partner_id = $1 
            GROUP BY is_active;
        `;
        const result = await db.query(statsQuery, [id]);
        
        const stats = {
            active: 0,
            inactive: 0
        };

        result.rows.forEach(row => {
            if (row.is_active) {
                stats.active = parseInt(row.count, 10);
            } else {
                stats.inactive = parseInt(row.count, 10);
            }
        });

        res.json(stats);
    } catch (err) {
        console.error('Error fetching user stats for business partner:', err.message);
        res.status(500).send('Server error');
    }
};

// GET membership level names for a business partner
exports.getMembershipLevels = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'SELECT level_1_name, level_2_name, level_3_name FROM business_partners WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching membership levels:', err.message);
        res.status(500).send('Server error');
    }
};
