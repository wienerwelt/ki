// backend/routes/publicRoutes.js
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const adminBusinessPartnerController = require('../controllers/adminBusinessPartnerController');

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

let redisClient;
try {
  redisClient = new Redis(
    process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
      password: process.env.REDIS_PASS || undefined,
    }
  );
  redisClient.on('error', (err) => console.error('[public-routes] Redis error:', err?.message || err));
} catch (e) {
  redisClient = null;
}

function makeRedisStore(prefix) {
  if (!redisClient) return undefined; 
  return new RedisStore({
    prefix: prefix || 'rl:public:',
    sendCommand: (...args) => redisClient.call(...args),
  });
}

// Erlaubt maximal 60 Anfragen pro Minute von der selben IP
const publicDataLimiter = rateLimit({
  store: makeRedisStore('rl:public:data:'),
  windowMs: 1 * 60 * 1000, 
  max: 60, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Zu viele Anfragen an die öffentliche API. Bitte warten Sie einen Moment.' },
});

// ==========================================
// Öffentliche Routen (Keine Auth-Middleware!)
// ==========================================

router.get('/context', publicDataLimiter, publicController.getPublicContext);
router.get('/widget-data', publicDataLimiter, publicController.getPublicWidgetData);
router.get('/partner-card/:id', publicDataLimiter, adminBusinessPartnerController.getPublicPartnerCard);

// Route für das Formular auf der Landingpage
router.post('/contact', publicDataLimiter, publicController.submitContactForm);

// ==========================================
// LIVE-DATEN WRAPPER FÜR LANDINGPAGE WIDGETS
// ==========================================
router.get('/sentiment', publicDataLimiter, publicController.getPublicSentiment);
router.get('/enhanced-calendar-events', publicDataLimiter, publicController.getPublicEvents);
router.get('/holidays', publicDataLimiter, publicController.getPublicHolidays);
router.get('/regions', publicDataLimiter, publicController.getPublicRegions);
router.get('/commodities', publicDataLimiter, publicController.getPublicCommodities);

// NEU: Hier fehlte die Route für das Daily Briefing!
router.get('/daily-briefing', publicDataLimiter, publicController.getPublicDailyBriefing);

module.exports = router;