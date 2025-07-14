const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const dataController = require('../controllers/dataController');

router.use(authMiddleware);

router.get('/fuel-prices', dataController.getFuelPrices);
router.get('/traffic-info', dataController.getTrafficInfo);
router.get('/ai-content', dataController.getAiContent);
router.get('/scraped-content', dataController.getScrapedContent);
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
router.post('/scraped-content/:contentId/mark-as-read', dataController.markScrapedContentAsRead);

// Diese Route sollte jetzt funktionieren, da die Funktion im dataController existiert
router.get('/actions', authMiddleware, dataController.getActiveActionsForWidget);

// Active Advertisement Endpoint
router.get('/active-advertisement', dataController.getActiveAdvertisement);

module.exports = router;
