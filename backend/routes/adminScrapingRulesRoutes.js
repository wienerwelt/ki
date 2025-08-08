// backend/routes/adminScrapingRulesRoutes.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminSrController = require('../controllers/adminScrapingRulesController');

// Alle Routen hier sind durch die Admin-Middleware geschützt
router.use(adminAuth);

// Routen für die Verwaltung der Regeln (CRUD)
router.get('/', adminSrController.getAllScrapingRules);
router.post('/', adminSrController.createScrapingRule);
router.put('/:id', adminSrController.updateScrapingRule);
router.delete('/:id', adminSrController.deleteScrapingRule);

// Route für die KI-Vorschläge
router.post('/suggest', adminSrController.getSuggestionForUrl);

// HINZUGEFÜGT: Route für die neue Datums-Testfunktion
// Diese Route muss vor den Routen mit Parametern wie '/:id' stehen, die ähnliche Pfade haben könnten,
// um eine korrekte Zuordnung sicherzustellen.
router.post('/test-date', adminSrController.testDateFormat);
router.post('/infer-date-format', adminSrController.inferDateFormat);

// Routen für das Triggern und Beobachten von Jobs
router.post('/:id/trigger-scrape', adminSrController.triggerScrapeJob);
router.get('/logs/:jobId', adminSrController.getScrapeLogs);

// Route für die Aktualisierung des Cron-Zeitplans
router.put('/:id/schedule', adminSrController.updateScrapingRuleSchedule);

module.exports = router;