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

// Routen für das Triggern und Beobachten von Jobs
router.post('/:id/trigger-scrape', adminSrController.triggerScrapeJob);

// KORREKTUR: Diese Route hat gefehlt. Sie definiert den Endpunkt zum Abrufen der Logs.
// Die URL lautet jetzt: GET /api/admin/scraping-rules/logs/:jobId
router.get('/logs/:jobId', adminSrController.getScrapeLogs);

module.exports = router;