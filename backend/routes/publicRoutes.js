// backend/routes/publicRoutes.js
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
// ✅ NEU: Import für die Partner-Card Logik
const adminBusinessPartnerController = require('../controllers/adminBusinessPartnerController');

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

// ---- Redis-Client Initialisierung (Analog zu authRoutes.js für Konsistenz) ----
let redisClient;
try {
  redisClient = new Redis(
    process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
      password: process.env.REDIS_PASS || undefined,
    }
  );
  redisClient.on('ready', () => console.log('[public-routes] Redis ready for rate-limiting'));
  redisClient.on('error', (err) => console.error('[public-routes] Redis error:', err?.message || err));
} catch (e) {
  console.warn('[public-routes] Redis-Client konnte nicht initialisiert werden, Fallback auf MemoryStore:', e?.message || e);
  redisClient = null;
}

// ---- Hilfsfunktion: Redis Store oder Memory Store ----
function makeRedisStore(prefix) {
  if (!redisClient) return undefined; // Fallback = MemoryStore
  return new RedisStore({
    prefix: prefix || 'rl:public:',
    sendCommand: (...args) => redisClient.call(...args),
  });
}

// ---- Rate Limiter für öffentliche Dashboard-Daten ----
// Erlaubt etwas mehr Traffic, da das Frontend diese Daten beim Laden der Login-Seite holt
const publicDataLimiter = rateLimit({
  store: makeRedisStore('rl:public:data:'),
  windowMs: 1 * 60 * 1000, // 1 Minute Fenster
  max: 60, // Erlaubt 60 Anfragen pro Minute pro IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Zu viele Anfragen an die öffentliche API. Bitte warten Sie einen Moment.' },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Public API Limit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

// ==========================================
// Öffentliche Routen (Keine Auth-Middleware!)
// ==========================================

/**
 * @route   GET /api/public/context
 * @desc    Liefert Branding (Logo, Farben) basierend auf ?partnerCode=...
 * und allgemeine "Pulse"-Statistiken für den Login-Hintergrund.
 */
router.get('/context', publicDataLimiter, publicController.getPublicContext);

/**
 * @route   GET /api/public/widget-data
 * @desc    Liefert "sichere", anonymisierte oder Mock-Daten für die
 * Ghost-Widgets (z.B. EV-Map Zentrum, allgemeine News).
 */
router.get('/widget-data', publicDataLimiter, publicController.getPublicWidgetData);

/**
 * @route   GET /api/public/partner-card/:id
 * @desc    Liefert öffentliche Daten (Name, Logo, Voucher-Code) für die
 * "Team einladen" Karte (PublicBpCard).
 */
// ✅ NEU: Route für die Einladungskarte
router.get('/partner-card/:id', publicDataLimiter, adminBusinessPartnerController.getPublicPartnerCard);

module.exports = router;