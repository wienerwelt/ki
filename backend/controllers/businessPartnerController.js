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

        const bpResult = await db.query(
            `SELECT
                bp.id,
                bp.name,
                bp.slug,
                bp.dashboard_title,
                bp.address,
                bp.logo_url,
                bp.email,
                bp.url_businesspartner,
                bp.subscription_start_date,
                bp.subscription_end_date,
                
                -- HIER SIND DIE WICHTIGEN NEUEN FELDER:
                bp.allow_automated_newsletter,
                bp.dashboard_focus,
                
                bp.level_1_name,
                bp.level_2_name,
                bp.level_3_name,
                bp.storage_tier,
                bp.storage_limit_bytes,
                bp.storage_usage_bytes,
                cs.primary_color,
                cs.secondary_color,
                (
                    SELECT COALESCE(
                        json_agg(
                            jsonb_build_object(
                                'id', r.id,
                                'name', r.name,
                                'code', r.code,
                                'is_default', bpr.is_default
                            )
                            ORDER BY bpr.is_default DESC, r.name ASC
                        ),
                        '[]'::json
                    )
                    FROM business_partner_regions bpr
                    JOIN regions r ON bpr.region_id = r.id
                    WHERE bpr.business_partner_id = bp.id
                ) AS regions
            FROM business_partners bp
            LEFT JOIN color_schemes cs ON cs.id = bp.color_scheme_id
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
