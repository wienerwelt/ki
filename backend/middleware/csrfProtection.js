const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/resend-verification',
  '/api/auth/logout',
]);

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path) || req.path.startsWith('/api/auth/reset-password/')) return next();

  const authorization = String(req.headers.authorization || '');
  const legacyToken = String(req.headers['x-auth-token'] || '');
  if (authorization.startsWith('Bearer ') || (legacyToken && legacyToken !== 'null')) return next();

  if (!req.cookies?.token) return next();
  if (!safeEqual(req.cookies.csrf_token, req.headers['x-csrf-token'])) {
    return res.status(403).json({ message: 'Sicherheitsprüfung der Anfrage fehlgeschlagen. Bitte Seite neu laden.' });
  }
  return next();
};
