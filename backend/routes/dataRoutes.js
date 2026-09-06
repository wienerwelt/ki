// backend/routes/dataRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const dataController = require('../controllers/dataController');
const adminBpAccountsController = require('../controllers/adminBpAccountsController');
const { rateLimit } = require('express-rate-limit');
const { ACCOUNT_RADAR_ROLES, requireTenantModule } = require('../services/tenantModuleService');
const { requireActiveSalesSubscription } = require('../services/salesPlanService');
const requireContentModule = requireTenantModule('content');

router.use(authMiddleware);

const aiAskBurstLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user.id}`,
    message: { message: 'Zu viele KI-Anfragen in kurzer Zeit. Bitte kurz warten.' },
});

const requireAccountRadarModule = requireTenantModule('sales', { allowedRoles: ACCOUNT_RADAR_ROLES });
const requireAccountRadarAccess = (req, res, next) => (
    requireAccountRadarModule(req, res, () => requireActiveSalesSubscription(req, res, next))
);

router.get('/relevant-action', requireContentModule, dataController.getRelevantAction);
router.get('/search', requireContentModule, dataController.globalSearch);
router.post('/ai-ask', aiAskBurstLimiter, dataController.handleAiQuestion);
router.delete('/ai-chat-sessions/:sessionId', dataController.deleteAiChatSession);
router.get('/fuel/search', requireContentModule, dataController.fuelSearch);
router.post('/fuel/prices-by-ids', requireContentModule, dataController.getPricesByIds);
router.get('/commodities', requireContentModule, dataController.getCommodityPrices);
router.get('/traffic-info', requireContentModule, dataController.getTrafficInfo);
router.get('/ai-content', requireContentModule, dataController.getAiContent);
router.get('/scraped-content', requireContentModule, dataController.getScrapedContent);
router.get('/scraped-content-counts', requireContentModule, dataController.getScrapedContentCounts);
router.get('/tax-changes', requireContentModule, dataController.getTaxChanges);
// router.get('/fleet-news', dataController.getFleetAssociationNews);
router.get('/traffic-regions', requireContentModule, dataController.getUniqueTrafficRegions);
router.get('/bp-scraped-content', requireContentModule, dataController.getBpScrapedContent);
router.get('/vignettes', requireContentModule, dataController.getVignettePrices);
router.post('/content/:contentId/vote', requireContentModule, dataController.voteOnContent);
router.post('/content/:contentId/mark-as-read', requireContentModule, dataController.markContentAsRead);
router.post('/generate-email', requireContentModule, dataController.generateEmailFromContent);
router.get('/user-stats/:bpId', requireContentModule, dataController.getBusinessPartnerUserStatsForUser);
router.get('/ai-prompt-rules', requireContentModule, dataController.getAIPromptRulesForUser);
router.get('/categories', authMiddleware, dataController.getCategoriesForUser);
router.get('/regions', dataController.getAllRegions);
router.get('/ev-stations', requireContentModule, dataController.getEVStations);
router.get('/ev/search', requireContentModule, dataController.evStationSearch);
router.post('/scraped-content/:contentId/mark-as-read', requireContentModule, dataController.markScrapedContentAsRead);
router.post('/share-content-by-email', requireContentModule, dataController.shareContentByEmail);
router.get('/vignette-countries', requireContentModule, dataController.getVignetteCountries);
router.get('/commodities/history', requireContentModule, dataController.getCommodityHistory);
router.get('/calendar-events', requireContentModule, dataController.getCalendarEvents);
router.get('/enhanced-calendar-events', requireContentModule, dataController.getEnhancedCalendarEvents);
router.get('/holidays', requireContentModule, dataController.getPublicHolidays);
router.post('/events/:eventId/vote', requireContentModule, dataController.voteOnEventAttendance);
router.post('/events/share', requireContentModule, dataController.shareEventByEmail);
router.get('/dashboard/config', dataController.getDashboardConfig);
router.get('/actions', requireContentModule, dataController.getActiveActionsForWidget);
router.get('/active-advertisement', dataController.getActiveAdvertisement);
router.get('/tags', requireContentModule, dataController.getTagsForCategory);
router.get('/all-tags', requireContentModule, dataController.getAllTags);
router.get('/events', requireContentModule, dataController.getEvents);
router.get('/economic-statistics', requireContentModule, dataController.getEconomicStatistics);
router.get('/economic-statistics/countries', requireContentModule, dataController.getUniqueStatCountries);
router.post('/generate-draft-from-content', requireContentModule, dataController.generateDraftFromContent);
router.patch('/account-intelligence/articles/:articleId/status', requireAccountRadarAccess, dataController.updateAccountIntelligenceStatus);
router.patch('/account-intelligence/articles/:articleId/relevance', requireAccountRadarAccess, dataController.updateAccountRadarRelevance);
router.patch('/account-intelligence/articles/:articleId/workflow', requireAccountRadarAccess, dataController.updateAccountIntelligenceWorkflow);
router.patch('/account-intelligence/articles/:articleId/task-status', requireAccountRadarAccess, dataController.updateAccountRadarTaskStatus);
router.get('/account-intelligence/articles/:articleId/activity', requireAccountRadarAccess, dataController.getAccountRadarTaskActivity);
router.get('/account-intelligence/accounts/:accountId', requireAccountRadarAccess, adminBpAccountsController.getAccountById);
router.get('/account-intelligence/team', requireAccountRadarAccess, dataController.getAccountRadarTeam);
router.get('/account-intelligence', requireAccountRadarAccess, dataController.getAccountIntelligence);
router.get('/notifications/count', dataController.getNotificationCounts);
router.get('/monitor-entries', requireContentModule, dataController.getMonitorEntries);
router.get('/bp-members-preview', requireContentModule, dataController.getBusinessPartnerMembersPreview);
router.get('/daily-briefing', requireContentModule, dataController.getDailyBriefing);
//router.get('/daily-briefing/pdf', dataController.getDailyBriefingPdfByToken);
router.get('/notification-counts', dataController.getNotificationCounts);

router.get('/sentiment', requireContentModule, dataController.getMarketSentiment);
router.post('/sentiment/vote', requireContentModule, dataController.voteSentiment);

module.exports = router;
