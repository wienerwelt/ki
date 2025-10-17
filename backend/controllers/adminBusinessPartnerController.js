// backend/controllers/adminBusinessPartnerController.js
const db = require('../config/db');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3Client.js");
const { v4: uuidv4 } = require('uuid');

exports.getAllBusinessPartners = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                bp.id, bp.name, bp.dashboard_title, bp.address, bp.logo_url, bp.email,
                bp.subscription_start_date, bp.subscription_end_date, bp.color_scheme_id,
                bp.is_active, bp.created_at, bp.updated_at, bp.url_businesspartner,
                bp.level_1_name, bp.level_2_name, bp.level_3_name,
                bp.storage_tier, bp.storage_usage_bytes, bp.storage_limit_bytes,
                bp.allow_automated_newsletter, bp.dashboard_focus,
                cs.name AS color_scheme_name,
                (SELECT COUNT(*)::int FROM users u WHERE u.business_partner_id = bp.id) AS user_count,
                (SELECT COUNT(*)::int FROM business_partner_widget_access wa WHERE wa.business_partner_id = bp.id) AS widget_count,
                (SELECT COUNT(*)::int FROM business_partner_files bpf WHERE bpf.business_partner_id = bp.id) AS file_count,
                (SELECT COUNT(*)::int FROM business_partner_accounts bpa WHERE bpa.business_partner_id = bp.id) as account_count,
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = bp.id) AS regions,
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', c.id, 'name', c.name)
                    ORDER BY c.name ASC
                ), '[]'::json)
                 FROM business_partner_categories bpc
                 JOIN categories c ON bpc.category_id = c.id
                 WHERE bpc.business_partner_id = bp.id AND c.category_type = 'industry') AS industries
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
            `SELECT
                bp.id, bp.name, bp.dashboard_title, bp.address, bp.logo_url, bp.email,
                bp.subscription_start_date, bp.subscription_end_date, bp.color_scheme_id,
                bp.is_active, bp.created_at, bp.updated_at, bp.url_businesspartner,
                bp.level_1_name, bp.level_2_name, bp.level_3_name,
                bp.allow_automated_newsletter, -- NEU
                cs.name AS color_scheme_name, cs.primary_color, cs.secondary_color,
               (SELECT COALESCE(json_agg(
                   jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
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

exports.createBusinessPartner = async (req, res) => {
    const {
        name, address, logo_url, subscription_start_date, subscription_end_date,
        color_scheme_id, is_active, url_businesspartner, region_ids = [],
        dashboard_title, level_1_name, level_2_name, level_3_name,
        default_region_id, email, allow_automated_newsletter,
        category_ids = [], dashboard_focus
    } = req.body;

    if (!name) return res.status(400).json({ message: 'Name is required.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const bpResult = await client.query(
            `INSERT INTO business_partners (
                name, address, logo_url, subscription_start_date, subscription_end_date,
                color_scheme_id, is_active, url_businesspartner, dashboard_title,
                level_1_name, level_2_name, level_3_name, email, allow_automated_newsletter,
                dashboard_focus
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
            [
                name, address || null, logo_url || null, subscription_start_date || null,
                subscription_end_date || null, color_scheme_id || null, is_active,
                url_businesspartner || null, dashboard_title || null, level_1_name || null,
                level_2_name || null, level_3_name || null, email || null,
                !!allow_automated_newsletter, dashboard_focus || 'information'
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

        if (category_ids && category_ids.length > 0) {
            for (const category_id of category_ids) {
                await client.query(
                    'INSERT INTO business_partner_categories (business_partner_id, category_id) VALUES ($1, $2)',
                    [newBp.id, category_id]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json(newBp);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating business partner:', err.message);
        if (err.constraint === 'business_partners_email_key') {
            return res.status(409).json({ message: 'Ein Business Partner mit dieser E-Mail-Adresse existiert bereits.' });
        }
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};


exports.updateBusinessPartner = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const {
        name, address, logo_url, subscription_start_date, subscription_end_date,
        color_scheme_id, is_active, url_businesspartner, region_ids = [],
        dashboard_title, level_1_name, level_2_name, level_3_name,
        default_region_id, email, storage_tier, allow_automated_newsletter,
        // NEUE FELDER HINZUGEFÜGT
        category_ids = [], dashboard_focus 
    } = req.body;

    const validTiers = {
        'free': 0,
        'standard': 104857600,
        'premium': 1048576000
    };

    if (storage_tier && !validTiers.hasOwnProperty(storage_tier)) {
        return res.status(400).json({ message: 'Ungültiger Tier-Name.' });
    }
    const newLimit = storage_tier ? validTiers[storage_tier] : undefined;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const updatedBpResult = await client.query(
            `UPDATE business_partners SET
                name = $1, address = $2, logo_url = $3, subscription_start_date = $4,
                subscription_end_date = $5, color_scheme_id = $6, is_active = $7,
                url_businesspartner = $8, dashboard_title = $9, level_1_name = $10,
                level_2_name = $11, level_3_name = $12, email = $13, 
                storage_tier = COALESCE($14, storage_tier), 
                storage_limit_bytes = COALESCE($15, storage_limit_bytes), 
                allow_automated_newsletter = $16,
                dashboard_focus = $17, -- NEU
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $18 RETURNING *`, // Parameter-Index angepasst
            [
                name, address || null, logo_url || null, subscription_start_date || null, subscription_end_date || null,
                color_scheme_id || null, is_active, url_businesspartner || null, dashboard_title || null,
                level_1_name || null, level_2_name || null, level_3_name || null, email || null,
                storage_tier, newLimit, !!allow_automated_newsletter,
                dashboard_focus || 'information', // NEU
                id // Parameter-Index angepasst
            ]
        );
        if (updatedBpResult.rows.length === 0) throw new Error('Business Partner not found.');

        // Regions-Logik bleibt unverändert
        await client.query('DELETE FROM business_partner_regions WHERE business_partner_id = $1', [id]);
        if (region_ids && region_ids.length > 0) {
            for (const region_id of region_ids) {
                const isDefault = region_id === default_region_id;
                await client.query('INSERT INTO business_partner_regions (business_partner_id, region_id, is_default) VALUES ($1, $2, $3)', [id, region_id, isDefault]);
            }
        }
        
        // NEUE LOGIK FÜR BRANCHEN/KATEGORIEN
        await client.query('DELETE FROM business_partner_categories WHERE business_partner_id = $1', [id]);
        if (category_ids && category_ids.length > 0) {
            for (const category_id of category_ids) {
                await client.query('INSERT INTO business_partner_categories (business_partner_id, category_id) VALUES ($1, $2)', [id, category_id]);
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

// ... (rest of the controller remains unchanged)
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

exports.getAllColorSchemes = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, primary_color, secondary_color FROM color_schemes ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all color schemes:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getAllRegions = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, code FROM regions ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all regions:', err.message);
        res.status(500).send('Server error');
    }
};

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

exports.updateBusinessPartnerTier = async (req, res) => {
    const { id } = req.params;
    const { tier } = req.body;

    const validTiers = {
        'free': 0,
        'standard': 104857600,    // 100 MB
        'premium': 1048576000     // 1 GB
    };

    if (!validTiers.hasOwnProperty(tier)) {
        return res.status(400).json({ message: 'Ungültiger Tier-Name.' });
    }

    const newLimit = validTiers[tier];

    try {
        const result = await db.query(
            `UPDATE business_partners 
             SET storage_tier = $1, storage_limit_bytes = $2 
             WHERE id = $3 
             RETURNING id, name, storage_tier, storage_limit_bytes`,
            [tier, newLimit, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner nicht gefunden.' });
        }

        res.status(200).json({ 
            message: `Tier für ${result.rows[0].name} erfolgreich auf '${tier}' aktualisiert.`,
            businessPartner: result.rows[0]
        });

    } catch (err) {
        console.error('Fehler beim Aktualisieren des Business Partner Tiers:', err.message);
        res.status(500).send('Serverfehler');
    }
};



exports.uploadBusinessPartnerLogo = async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ message: "Keine Datei hochgeladen." });
    }

    // Eindeutigen Dateinamen generieren, um Kollisionen zu vermeiden
    const fileExtension = file.originalname.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const storagePath = `logos/${uniqueFileName}`; // Zielordner in S3

    try {
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
            Body: file.buffer,
            ContentType: file.mimetype
        };

        await s3Client.send(new PutObjectCommand(params));

        // Die öffentliche URL der Datei konstruieren
        const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${storagePath}`;

        return res.status(200).json({
            message: "Logo erfolgreich hochgeladen.",
            url: publicUrl
        });

    } catch (error) {
        console.error("Fehler beim Logo-Upload:", error);
        return res.status(500).json({ message: "Fehler beim Server während des Logo-Uploads." });
    }
};
