// backend/routes/fundingRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const fundingController = require('../controllers/fundingController');
const { requireTenantModule } = require('../services/tenantModuleService');

router.use(authMiddleware);
router.use(requireTenantModule('content'));

router.get('/top-opportunities', fundingController.getTopOpportunities);
router.get('/search', fundingController.searchFunding);
router.get('/categories', fundingController.getFundingCategories);
router.get('/user-categories', fundingController.getUserFundingCategories);
router.post('/user-categories', fundingController.updateUserFundingCategories);
router.get('/regions', fundingController.getRegions);
router.get('/used-regions', fundingController.getUsedRegions); 
router.post('/status', fundingController.setFundingStatus);
router.post('/generate-draft', fundingController.generateApplicationDraft);
router.get('/saved-searches', fundingController.getSavedSearches);
router.post('/saved-searches', fundingController.saveSearch);
router.delete('/saved-searches/:id', fundingController.deleteSearch);
router.get('/:id', fundingController.getFundingDetailById);
router.put('/saved-searches/:id/toggle-notifications', fundingController.toggleSearchNotifications);
router.get('/:id', fundingController.getFundingDetailById);

module.exports = router;
