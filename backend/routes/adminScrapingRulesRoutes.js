// backend/routes/adminScrapingRulesRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminSrController = require('../controllers/adminScrapingRulesController');

router.use(adminAuth);

// Diagnose / Hilfsrouten müssen vor /:id stehen.
router.get('/queue-status', adminSrController.getQueueStatus);
router.post('/test-rule', adminSrController.testScrapingRule);
router.post('/suggest', adminSrController.getSuggestionForUrl);
router.post('/test-date', adminSrController.testDateFormat);
router.post('/infer-date-format', adminSrController.inferDateFormat);

router.get('/', adminSrController.getAllScrapingRules);
router.post('/', adminSrController.createScrapingRule);
router.put('/:id', adminSrController.updateScrapingRule);
router.delete('/:id', adminSrController.deleteScrapingRule);

router.post('/:id/test-rule', adminSrController.testScrapingRule);
router.post('/:id/trigger-scrape', adminSrController.triggerScrapeJob);
router.get('/logs/:jobId', adminSrController.getScrapeLogs);
router.put('/:id/schedule', adminSrController.updateScrapingRuleSchedule);

module.exports = router;
