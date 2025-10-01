// backend/routes/adminFundingRoutes.js
const express = require('express');
const router = express.Router();

const adminAuth = require('../middleware/adminAuth');
const controller = require('../controllers/adminFundingController');

router.use(adminAuth);

// Spezifische Routen (ohne :id) ZUERST
router.get('/stats', controller.getFundingStats);
router.get('/usage-stats', controller.getFundingUsageStats);
router.get('/categories', controller.getAllFundingCategories);
router.get('/regions', controller.getAllRegions);
router.get('/source-rules', controller.getFundingSourceRules);

// Wichtig: Die Bulk-Delete-Route muss vor '/:id' stehen.
// Sie reagiert auf DELETE-Anfragen an die Basis-URL (z.B. /api/admin/funding)
router.delete('/', controller.deleteMultipleFundingOpportunities);

// Allgemeine Routen / mit Parametern
router.get('/', controller.getAllFundingOpportunities);
router.get('/:id', controller.getFundingDetailById);
router.put('/:id', controller.updateFundingOpportunity);
router.delete('/:id', controller.deleteFundingOpportunity);

module.exports = router;