// backend/controllers/businessPartnerController.js
const db = require('../config/db');

exports.getMyBusinessPartner = async (req, res) => {
    try {
        const userId = req.user.id; // Kommt vom Auth-Middleware

        // Zuerst die business_partner_id des Benutzers abfragen
        const userResult = await db.query(
            'SELECT business_partner_id FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0 || !userResult.rows[0].business_partner_id) {
            return res.status(404).json({ message: 'Business Partner not found or not assigned to user.' });
        }

        const businessPartnerId = userResult.rows[0].business_partner_id;

        // Dann die Details des Business Partners inklusive Farbschema und Regionen abfragen
        // KORREKTUR: Die Abfrage wurde erweitert, um alle für das Widget benötigten Felder explizit abzufragen.
        const bpResult = await db.query(
            `SELECT
                bp.id,
                bp.name,
                bp.dashboard_title,
                bp.address,
                bp.logo_url,
                bp.email,
                bp.url_businesspartner,
                bp.subscription_start_date,
                bp.subscription_end_date,
                bp.level_1_name,
                bp.level_2_name,
                bp.level_3_name,
                cs.primary_color,
                cs.secondary_color,
                cs.text_color,
                cs.background_color,
                cs.accent_color,
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                    ORDER BY bpr.is_default DESC, r.name ASC
                ), '[]'::json)
                 FROM business_partner_regions bpr
                 JOIN regions r ON bpr.region_id = r.id
                 WHERE bpr.business_partner_id = bp.id) AS regions
            FROM business_partners bp
            LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
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
