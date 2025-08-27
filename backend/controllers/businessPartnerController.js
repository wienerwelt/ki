// backend/controllers/businessPartnerController.js
const db = require('../config/db');

exports.getMyBusinessPartner = async (req, res) => {
    try {
        const userId = req.user.id;

        const userResult = await db.query(
            'SELECT business_partner_id FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0 || !userResult.rows[0].business_partner_id) {
            return res.status(404).json({ message: 'Business Partner not found or not assigned to user.' });
        }

        const businessPartnerId = userResult.rows[0].business_partner_id;

        // --- KORREKTUR: SQL-Abfrage liefert jetzt ein verschachteltes color_scheme-Objekt ---
        const bpResult = await db.query(
            `SELECT
                bp.id, bp.name, bp.dashboard_title, bp.address, bp.logo_url, bp.email,
                bp.url_businesspartner, bp.subscription_start_date, bp.subscription_end_date,
                bp.level_1_name, bp.level_2_name, bp.level_3_name,
                bp.storage_tier, bp.storage_limit_bytes, bp.storage_usage_bytes,
                
                -- Erstellt ein sauberes, verschachteltes JSON-Objekt für das Farbschema
                (
                    SELECT jsonb_build_object(
                        'id', cs.id,
                        'name', cs.name,
                        'primary_color', cs.primary_color,
                        'secondary_color', cs.secondary_color,
                        'text_color_light', cs.text_color_light,
                        'background_color_light', cs.background_color_light,
                        'paper_color_light', cs.paper_color_light,
                        'text_color_dark', cs.text_color_dark,
                        'background_color_dark', cs.background_color_dark,
                        'paper_color_dark', cs.paper_color_dark
                    )
                    FROM color_schemes cs
                    WHERE cs.id = bp.color_scheme_id
                ) AS color_scheme,
                
                -- Bestehende Subquery für Regionen bleibt unverändert
                (
                    SELECT COALESCE(json_agg(
                        jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                        ORDER BY bpr.is_default DESC, r.name ASC
                    ), '[]'::json)
                    FROM business_partner_regions bpr
                    JOIN regions r ON bpr.region_id = r.id
                    WHERE bpr.business_partner_id = bp.id
                ) AS regions
            FROM business_partners bp
            WHERE bp.id = $1`,
            [businessPartnerId]
        );

        if (bpResult.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner details not found.' });
        }

        res.json(bpResult.rows[0]);

    } catch (err) {
        console.error('Error fetching business partner details:', err.message);
        res.status(500).send('Server error');
    }
};