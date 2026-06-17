// backend/routes/publicRoutes.js
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

// --- 1. BRANDING & KONTEXT ---
router.get('/context', publicController.getPublicContext);

// --- 2. PUBLIC PARTNER CARD (HIER IST DIE NEUE ROUTE!) ---
router.get('/partner-card/:id', publicController.getPublicPartnerCard);

// --- 3. KONTAKTFORMULAR ---
router.post('/contact', publicController.submitContactForm);

// --- 4. DER NEUE GENERIC WIDGET HUB (Für alle zukünftigen Widgets) ---
router.get('/widget-data/:widgetKey', publicController.getGenericWidgetData);

// =====================================================================
// 5. LEGACY ROUTEN (Rückwärtskompatibilität für dein aktuelles Frontend)
// =====================================================================
router.get('/regions', publicController.getPublicRegions);
router.get('/enhanced-calendar-events', publicController.getPublicEvents);
router.get('/holidays', publicController.getPublicHolidays);
router.get('/actions', publicController.getPublicActions);
router.get('/commodities', publicController.getPublicCommodities);
router.get('/sentiment', publicController.getPublicSentiment);
router.get('/daily-briefing', publicController.getPublicDailyBriefing);
router.get('/directory', publicController.getPublicDirectory);
router.get('/economic-statistics', publicController.getPublicEconomicStatistics);
router.get('/economic-statistics/countries', publicController.getPublicEconomicStatCountries);

module.exports = router;