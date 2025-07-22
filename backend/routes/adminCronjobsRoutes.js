// backend/routes/adminCronjobsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const controller = require('../controllers/adminCronjobsController');

router.use(adminAuth);

// --- Routen für KI-Abonnements ---
router.get('/ai-subscriptions', controller.getScheduledAISubscriptions);
router.get('/ai-subscriptions/:subscriptionId/history', controller.getAIJobHistory);
router.post('/ai-subscriptions/:id/trigger', controller.triggerAISubscription);
router.delete('/ai-subscriptions', controller.deleteAISubscriptions);
router.put('/ai-subscriptions/:id', controller.updateAISubscription);

// --- NEU: Routen für System-Jobs (Redaktionell) ---
router.get('/system-subscriptions', controller.getSystemSubscriptions);
router.post('/system-subscriptions', controller.createSystemSubscription);
router.put('/system-subscriptions/:id', controller.updateSystemSubscription);
router.delete('/system-subscriptions/:id', controller.deleteSystemSubscription);
router.get('/scraping-rules', controller.getScheduledScrapingRules);

// --- Routen für E-Mail-Jobs ---
router.get('/emails', controller.getAllEmailJobs);
router.post('/emails', controller.createEmailJob);
router.put('/emails/:id', controller.updateEmailJob);
router.delete('/emails/:id', controller.deleteEmailJob);
router.post('/emails/:id/trigger', controller.triggerEmailJob);




module.exports = router;
