// backend/routes/dataRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const dataController = require('../controllers/dataController');

// Alle Routen in dieser Datei sind durch die authMiddleware geschützt
router.use(authMiddleware);

router.get('/fuel-prices', dataController.getFuelPrices);
router.get('/traffic-info', dataController.getTrafficInfo);
//router.get('/ai-content', dataController.getAIContentByCategory);
router.get('/ai-content', dataController.getAiContent);
router.get('/tax-changes', dataController.getTaxChanges);
router.get('/fleet-news', dataController.getFleetAssociationNews);
router.get('/traffic-regions', dataController.getUniqueTrafficRegions);
router.get('/bp-scraped-content', dataController.getBpScrapedContent);
router.get('/vignettes', dataController.getVignettePrices);
router.post('/content/:contentId/vote', dataController.voteOnContent);
router.post('/content/:contentId/mark-as-read', dataController.markContentAsRead);
router.post('/generate-email', authMiddleware, dataController.generateEmailFromContent);
router.get('/user-stats/:bpId', authMiddleware, dataController.getBusinessPartnerUserStatsForUser);
router.get('/ai-prompt-rules', authMiddleware, dataController.getAIPromptRulesForUser);
router.get('/categories', authMiddleware, dataController.getCategoriesForUser);
router.get('/regions', dataController.getAllRegions);
router.get('/ev-stations', authMiddleware, dataController.getEVStations);

module.exports = router;
