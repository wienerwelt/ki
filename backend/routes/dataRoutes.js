const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const dataController = require('../controllers/dataController');

router.use(authMiddleware);

router.get('/relevant-action', dataController.getRelevantAction)
router.get('/search', dataController.globalSearch);
router.get('/fuel/search', dataController.fuelSearch);
router.post('/fuel/prices-by-ids', dataController.getPricesByIds);
router.get('/commodities', dataController.getCommodityPrices);
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
router.post('/share-content-by-email', authMiddleware, dataController.shareContentByEmail);
router.get('/vignette-countries', dataController.getVignetteCountries);
router.get('/commodities/history', dataController.getCommodityHistory);
router.get('/calendar-events', authMiddleware, dataController.getCalendarEvents);
router.get('/enhanced-calendar-events', authMiddleware, dataController.getEnhancedCalendarEvents);
router.post('/events/:eventId/vote', authMiddleware, dataController.voteOnEventAttendance);
router.post('/events/share', authMiddleware, dataController.shareEventByEmail);
router.get('/dashboard/config', dataController.getDashboardConfig);
router.get('/actions', authMiddleware, dataController.getActiveActionsForWidget);
router.get('/active-advertisement', dataController.getActiveAdvertisement);
router.get('/tags', dataController.getTagsForCategory);

// --- NEU: Route, um alle existierenden Tags für Autocomplete abzurufen ---
router.get('/all-tags', dataController.getAllTags);

module.exports = router;