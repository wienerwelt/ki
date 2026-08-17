const crypto = require('crypto');

const SESSION_MAX_AGE_MS = Math.max(
  15 * 60 * 1000,
  Number(process.env.SESSION_COOKIE_MAX_AGE_MS) || 8 * 60 * 60 * 1000
);

const cookieBase = () => ({
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
});

function setSessionCookies(res, token) {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  res.cookie('token', token, { ...cookieBase(), httpOnly: true, maxAge: SESSION_MAX_AGE_MS });
  res.cookie('csrf_token', csrfToken, { ...cookieBase(), httpOnly: false, maxAge: SESSION_MAX_AGE_MS });
  return { expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString() };
}

function ensureCsrfCookie(req, res) {
  if (req.cookies?.csrf_token) return null;
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  res.cookie('csrf_token', csrfToken, { ...cookieBase(), httpOnly: false, maxAge: SESSION_MAX_AGE_MS });
  return csrfToken;
}

function clearSessionCookies(res) {
  res.clearCookie('token', { ...cookieBase(), httpOnly: true });
  res.clearCookie('csrf_token', { ...cookieBase(), httpOnly: false });
}

module.exports = { SESSION_MAX_AGE_MS, setSessionCookies, ensureCsrfCookie, clearSessionCookies };
