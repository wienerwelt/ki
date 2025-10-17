// backend/routes/adminCronjobsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

// KORREKTUR: Fügen Sie diese Zeile hinzu, um den Controller zu importieren
const adminCronjobsController = require('../controllers/adminCronjobsController');

router.use(adminAuth);

// --- AI Subscription Routes ---
router.get('/ai-subscriptions', adminCronjobsController.getScheduledAISubscriptions);
router.put('/ai-subscriptions/:id', adminCronjobsController.updateAISubscription);
router.post('/ai-subscriptions/:id/trigger', adminCronjobsController.triggerAISubscription);
router.post('/ai-subscriptions/delete-many', adminCronjobsController.deleteAISubscriptions);
router.get('/ai-subscriptions/:subscriptionId/history', adminCronjobsController.getAIJobHistory);

// --- System Subscription Routes ---
router.get('/system-subscriptions', adminCronjobsController.getSystemSubscriptions);
router.post('/system-subscriptions', adminCronjobsController.createSystemSubscription);
router.put('/system-subscriptions/:id', adminCronjobsController.updateSystemSubscription);
router.delete('/system-subscriptions/:id', adminCronjobsController.deleteSystemSubscription);

// --- Data Update Job Routes ---
router.get('/data-updates', adminCronjobsController.getAllDataUpdateJobs);
router.put('/data-updates/:id', adminCronjobsController.updateDataUpdateJob);
router.post('/data-updates/trigger', adminCronjobsController.triggerDataUpdateJob);
router.post('/data-updates', adminCronjobsController.createDataUpdateJob);


// --- Scraping Rule Routes ---
router.get('/scraping-rules', adminCronjobsController.getScheduledScrapingRules);
router.get('/scraping/cronjobs', adminCronjobsController.getScrapingCronjobs);
router.post('/scraping/trigger-account-intelligence', adminCronjobsController.triggerAccountIntelligenceJob);

// --- Email Cronjob Routes ---
router.get('/emails', adminCronjobsController.getAllEmailJobs);
router.post('/emails', adminCronjobsController.createEmailJob);
router.put('/emails/:id', adminCronjobsController.updateEmailJob);
router.delete('/emails/:id', adminCronjobsController.deleteEmailJob);
// Deine Route war /emails/:id/trigger, das wird hier korrigiert
router.post('/emails/:id/trigger', adminCronjobsController.triggerEmailJob);

router.put('/:id', adminCronjobsController.updateCronjob);
// NEUE ROUTE zum Abrufen der gefundenen Artikel
router.get('/tracked-articles', adminCronjobsController.getTrackedArticles);
router.delete('/tracked-articles', adminCronjobsController.deleteTrackedArticles); // NEU
router.get('/tracked-articles/accounts', adminCronjobsController.getTrackedArticleAccounts);

module.exports = router;