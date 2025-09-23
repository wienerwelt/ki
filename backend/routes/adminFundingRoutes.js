// backend/routes/adminFundingRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const controller = require('../controllers/adminFundingController');
router.use(adminAuth);
router.get('/usage-stats', controller.getFundingUsageStats);
router.get('/', controller.getAllFundingOpportunities);
router.put('/:id', controller.updateFundingOpportunity);
router.delete('/:id', controller.deleteFundingOpportunity);
router.get('/categories', controller.getAllFundingCategories);
router.get('/regions', controller.getAllRegions);
router.get('/source-rules', controller.getFundingSourceRules);
router.get('/:id', controller.getFundingDetailById);
module.exports = router;