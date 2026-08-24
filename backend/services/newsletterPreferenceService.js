const jwt = require('jsonwebtoken');

const TOKEN_PURPOSE = 'newsletter-preferences';

function getSecret() {
  const secret = String(process.env.NEWSLETTER_TOKEN_SECRET || '');
  const jwtSecret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32) {
    throw new Error('NEWSLETTER_TOKEN_SECRET muss separat mit mindestens 32 zufälligen Zeichen konfiguriert sein.');
  }
  if (jwtSecret && secret === jwtSecret) {
    throw new Error('NEWSLETTER_TOKEN_SECRET darf nicht mit JWT_SECRET identisch sein.');
  }
  return secret;
}

function createPreferenceToken(userId) {
  if (!userId) return null;
  return jwt.sign(
    { sub: String(userId), purpose: TOKEN_PURPOSE },
    getSecret(),
    { algorithm: 'HS256', expiresIn: '370d' }
  );
}

function verifyPreferenceToken(token) {
  const payload = jwt.verify(String(token || ''), getSecret(), { algorithms: ['HS256'] });
  if (payload?.purpose !== TOKEN_PURPOSE || !payload?.sub) throw new Error('Ungültiger Präferenz-Token.');
  return String(payload.sub);
}

function getFrontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

function buildPreferenceUrl(userId) {
  const token = createPreferenceToken(userId);
  return token ? `${getFrontendBaseUrl()}/newsletter/preferences/${encodeURIComponent(token)}` : null;
}

function buildOneClickUnsubscribeUrl(userId) {
  const token = createPreferenceToken(userId);
  return token ? `${getFrontendBaseUrl()}/api/newsletter/unsubscribe/${encodeURIComponent(token)}` : null;
}

module.exports = {
  createPreferenceToken,
  verifyPreferenceToken,
  buildPreferenceUrl,
  buildOneClickUnsubscribeUrl,
};
