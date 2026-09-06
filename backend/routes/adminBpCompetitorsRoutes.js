// backend/routes/adminBpCompetitorsRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const accountRadarManagerAuth = require('../middleware/accountRadarManagerAuth');
const adminCompetitorsController = require('../controllers/adminBpCompetitorsController.js');
const { hasSalesFeature } = require('../services/salesPlanService');

router.use(accountRadarManagerAuth);

const requireCompetitorMonitoring = async (req, res, next) => {
    const accountId = req.params.accountId || null;
    const competitorId = req.params.competitorId || null;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if ((accountId && !uuidPattern.test(accountId)) || (competitorId && !uuidPattern.test(competitorId))) {
        return res.status(400).json({ message: 'Ungültige Account- oder Wettbewerber-ID.' });
    }
    const tenantScope = req.user?.role === 'admin' ? null : req.user?.business_partner_id;
    try {
        const result = await db.query(
            `SELECT partner.sales_plan
             FROM business_partners partner
             JOIN business_partner_accounts account ON account.business_partner_id = partner.id
             LEFT JOIN business_partner_competitors competitor ON competitor.account_id = account.id
             WHERE (
                    ($1::uuid IS NOT NULL AND account.id = $1::uuid)
                    OR ($2::uuid IS NOT NULL AND competitor.id = $2::uuid)
                   )
               AND ($3::uuid IS NULL OR partner.id = $3::uuid)
             LIMIT 1`,
            [accountId, competitorId, tenantScope]
        );
        if (!result.rows.length) return res.status(404).json({ message: 'Account oder Wettbewerber wurde nicht gefunden.' });
        if (!hasSalesFeature(result.rows[0].sales_plan, 'competitorMonitoring')) {
            return res.status(403).json({
                message: 'Wettbewerber-Monitoring ist in Sales Premium enthalten.',
                code: 'SALES_FEATURE_NOT_INCLUDED',
                feature: 'competitorMonitoring',
            });
        }
        return next();
    } catch (error) {
        console.error('Sales-Paket für Wettbewerber konnte nicht geprüft werden:', error.message);
        return res.status(500).json({ message: 'Sales-Paket konnte nicht geprüft werden.' });
    }
};

router.get('/for-account/:accountId', requireCompetitorMonitoring, adminCompetitorsController.getCompetitorsForAccount);
router.post('/for-account/:accountId', requireCompetitorMonitoring, adminCompetitorsController.createCompetitor);
router.put('/:competitorId', requireCompetitorMonitoring, adminCompetitorsController.updateCompetitor);
router.delete('/:competitorId', requireCompetitorMonitoring, adminCompetitorsController.deleteCompetitor);

module.exports = router;
