// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

// ---- Redis-Client einmalig initialisieren ----
let redisClient;
try {
  redisClient = new Redis(
    process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
      password: process.env.REDIS_PASS || undefined,
    }
  );
  redisClient.on('ready', () => console.log('[rate-limit] Redis ready'));
  redisClient.on('error', (err) => console.error('[rate-limit] Redis error:', err?.message || err));
} catch (e) {
  console.warn('[rate-limit] Redis-Client konnte nicht initialisiert werden:', e?.message || e);
  redisClient = null; // Fallback = MemoryStore
}

// ---- Hilfsfunktion: Pro Limiter eine eigene Store-Instanz ----
function makeRedisStore(prefix) {
  if (!redisClient) return undefined; // -> MemoryStore verwenden
  return new RedisStore({
    prefix: prefix || 'rl:',
    sendCommand: (...args) => redisClient.call(...args),
  });
}

// ---- Registrierung: alle Versuche zählen ----
const registerLimiter = rateLimit({
  store: makeRedisStore('rl:register:'),
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.' },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Registrierungslimit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Login: nur fehlgeschlagene Versuche zählen ----
const loginLimiter = rateLimit({
  store: makeRedisStore('rl:login:'),
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Zu viele Login-Versuche. Bitte versuchen Sie es später erneut.' },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Loginlimit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Newsletter: Opt-In anstoßen (mäßig streng) ----
const newsletterOptInLimiter = rateLimit({
  store: makeRedisStore('rl:newsletter:'),
  windowMs: 30 * 60 * 1000, // 30 Minuten
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Newsletter-Opt-In-Limit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Auth & Newsletter Routen ----
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/google', authController.googleLogin);

router.get('/verify-email/:token', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.post('/resend-verification', authController.resendVerification);

// ✅ Newsletter Double-Opt-In
router.post('/newsletter/opt-in', newsletterOptInLimiter, authController.startNewsletterOptIn);
router.get('/newsletter/confirm/:token', authController.confirmNewsletterOptIn);

// (optional) Logout
router.post('/logout', authController.logout);

module.exports = router;
