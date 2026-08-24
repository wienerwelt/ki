// backend/routes/publicRoutes.js
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const publicController = require('../controllers/publicController');
const fileController = require('../controllers/fileController');
const softwareController = require('../controllers/softwareController');

const contactFormLimiter = rateLimit({
    // Kontaktformular bewusst strenger als die übrigen Public-Routen:
    // maximal 3 POST-Versuche pro IP und Stunde.
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.'
    }
});

const publicSearchLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Zu viele Suchanfragen. Bitte kurz warten.' },
});

const publicFileDownloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res
        .status(429)
        .type('text/plain')
        .send('Zu viele Download-Anfragen. Bitte versuchen Sie es später erneut.'),
});

// --- 1. BRANDING & KONTEXT ---
router.get('/context', publicController.getPublicContext);

// --- 2. PUBLIC PARTNER CARD (HIER IST DIE NEUE ROUTE!) ---
router.get('/partner-card/:id', publicController.getPublicPartnerCard);

// --- 3. KONTAKTFORMULAR ---
router.post('/contact', contactFormLimiter, publicController.submitContactForm);

// --- 4. PUBLIC EVENT FEEDS (RSS/JSON für Drittanbieter) ---
router.get('/v1/event-feed/:token.rss', publicController.getPublicEventFeedRss);
router.get('/v1/event-feed/:token.json', publicController.getPublicEventFeedJson);


// --- 5. PUBLIC DATEI-DOWNLOADS (geheime Direktlinks, keine öffentliche Liste) ---
router.get('/files/:id/:token', publicFileDownloadLimiter, fileController.getPublicFileInfo);
router.get('/files/:id/:token/download', publicFileDownloadLimiter, fileController.getPublicDownloadUrl);

// --- 6. DER NEUE GENERIC WIDGET HUB (Für alle zukünftigen Widgets) ---
router.get('/widget-data/:widgetKey', publicController.getGenericWidgetData);

// =====================================================================
// 7. LEGACY ROUTEN (Rückwärtskompatibilität für dein aktuelles Frontend)
// =====================================================================
router.get('/regions', publicController.getPublicRegions);
router.get('/enhanced-calendar-events', publicController.getPublicEvents);
router.get('/holidays', publicController.getPublicHolidays);
router.get('/actions', publicController.getPublicActions);
router.get('/commodities', publicController.getPublicCommodities);
router.get('/sentiment', publicController.getPublicSentiment);
router.get('/daily-briefing', publicController.getPublicDailyBriefing);
router.get('/directory', publicSearchLimiter, publicController.getPublicDirectory);
router.get('/software', publicSearchLimiter, softwareController.getPublicCatalog);
router.get('/economic-statistics', publicController.getPublicEconomicStatistics);
router.get('/economic-statistics/countries', publicController.getPublicEconomicStatCountries);

module.exports = router;
