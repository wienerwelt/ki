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

// NEU/KORRIGIERT: Route für die KI-Vorschläge
// Der Pfad ist '/suggest', da die Datei wahrscheinlich unter '/api/admin/scraping-rules' gemountet wird.
// Der Funktionsaufruf wurde auf adminSrController.getSuggestionForUrl korrigiert.
router.post('/suggest', adminSrController.getSuggestionForUrl);

// Routen für das Triggern und Beobachten von Jobs
router.post('/:id/trigger-scrape', adminSrController.triggerScrapeJob);
router.get('/logs/:jobId', adminSrController.getScrapeLogs);

module.exports = router;
