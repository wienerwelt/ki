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
  redisClient.on('error', (err) =>
    console.error('[rate-limit] Redis error:', err?.message || err)
  );
} catch (e) {
  console.warn(
    '[rate-limit] Redis-Client konnte nicht initialisiert werden:',
    e?.message || e
  );
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
  message: {
    message: 'Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.',
  },
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
  message: {
    message: 'Zu viele Login-Versuche. Bitte versuchen Sie es später erneut.',
  },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Loginlimit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Bestätigungsmail erneut senden ----
const resendVerificationLimiter = rateLimit({
  store: makeRedisStore('rl:resend-verification:'),
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Zu viele Anfragen für Bestätigungsmails. Bitte versuchen Sie es später erneut.',
  },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Resend-Verification-Limit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Passwort vergessen ----
const forgotPasswordLimiter = rateLimit({
  store: makeRedisStore('rl:forgot-password:'),
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Zu viele Passwort-Reset-Anfragen. Bitte versuchen Sie es später erneut.',
  },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Forgot-Password-Limit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Passwort zurücksetzen ----
const resetPasswordLimiter = rateLimit({
  store: makeRedisStore('rl:reset-password:'),
  windowMs: 30 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      'Zu viele Versuche beim Zurücksetzen des Passworts. Bitte versuchen Sie es später erneut.',
  },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Reset-Password-Limit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Newsletter: Opt-In anstoßen (mäßig streng) ----
const newsletterOptInLimiter = rateLimit({
  store: makeRedisStore('rl:newsletter:'),
  windowMs: 30 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
  },
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Newsletter-Opt-In-Limit erreicht für IP ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// ---- Auth-Routen ----
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);

router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, authController.resendVerification);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password/:token', resetPasswordLimiter, authController.resetPassword);

// ---- Newsletter Double-Opt-In ----
router.post('/newsletter/opt-in', newsletterOptInLimiter, authController.startNewsletterOptIn);
router.get('/newsletter/confirm/:token', authController.confirmNewsletterOptIn);

// ---- Logout ----
router.post('/logout', authController.logout);

// SSO: Google
router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

// SSO: LinkedIn
router.get('/linkedin', authController.linkedinAuth);
router.get('/linkedin/callback', authController.linkedinCallback);

module.exports = router;