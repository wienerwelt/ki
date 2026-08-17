const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sanitizeRichText } = require('../services/htmlSanitizer');

const BASE_URL = String(process.env.SECURITY_SMOKE_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(route, token, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${route}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_error) { body = text; }
  return { response, body };
}

function sign(user, overrides = {}) {
  return jwt.sign({
    sub: user.id,
    role: user.role,
    business_partner_id: user.business_partner_id,
    av: Number(user.auth_version || 0),
    ...overrides,
  }, process.env.JWT_SECRET, { expiresIn: '10m', algorithm: 'HS256' });
}

async function findUsers() {
  const assistantResult = await db.query(`
    SELECT id, role, business_partner_id, auth_version
    FROM users
    WHERE LOWER(role) = 'assistenz' AND is_active = TRUE AND business_partner_id IS NOT NULL
      AND (active_until IS NULL OR active_until > NOW())
    LIMIT 1
  `);
  assert(assistantResult.rowCount === 1, 'Für den Sicherheitstest fehlt eine aktive Mandantenassistenz.');
  const assistant = assistantResult.rows[0];

  const foreignResult = await db.query(`
    SELECT id, role, business_partner_id
    FROM users
    WHERE business_partner_id IS DISTINCT FROM $1
    LIMIT 1
  `, [assistant.business_partner_id]);
  assert(foreignResult.rowCount === 1, 'Für den Sicherheitstest fehlt ein Benutzer eines anderen Mandanten.');
  return { assistant, foreignUser: foreignResult.rows[0] };
}

function checkStoredXssProtection() {
  const dirty = '<p onclick="steal()">OK</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">X</a>';
  const clean = sanitizeRichText(dirty);
  assert(!/<script/i.test(clean), 'HTML-Sanitizer lässt script-Tags zu.');
  assert(!/onerror|onclick/i.test(clean), 'HTML-Sanitizer lässt Event-Handler zu.');
  assert(!/javascript:/i.test(clean), 'HTML-Sanitizer lässt javascript:-Links zu.');
  assert(clean.includes('OK'), 'HTML-Sanitizer entfernt zulässigen Inhalt.');
}

function checkFrontendTokenStorage() {
  const frontendRoot = path.resolve(__dirname, '..', '..', 'frontend', 'src');
  if (!fs.existsSync(frontendRoot)) {
    console.log('[security-smoke] Frontend-Quellcode ist im API-Container nicht eingebunden; Prüfung erfolgt im Preflight-Hostschritt.');
    return;
  }
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\.(ts|tsx|js|jsx)$/i.test(entry.name)) files.push(target);
    }
  };
  walk(frontendRoot);
  const forbidden = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (/localStorage\.(?:getItem|setItem)\(\s*['"](?:jwt_token|token)['"]/i.test(source)) forbidden.push(file);
    if (/[?&]token=\$?\{/i.test(source)) forbidden.push(file);
  }
  assert(forbidden.length === 0, `JWT wird noch im Frontend gespeichert oder in URLs übertragen: ${forbidden.join(', ')}`);
}

async function run() {
  assert(process.env.JWT_SECRET, 'JWT_SECRET fehlt.');
  const { assistant, foreignUser } = await findUsers();
  const assistantToken = sign(assistant);
  const forgedAdminToken = sign(assistant, { role: 'admin', business_partner_id: null });

  for (const route of [
    '/api/admin/business-partners',
    '/api/admin/advertisements',
    '/api/admin/cronjobs/emails',
  ]) {
    const result = await request(route, assistantToken);
    assert(result.response.status === 403, `Mandantenassistenz erreicht globale Admin-Route ${route}: HTTP ${result.response.status}`);
  }

  const forged = await request('/api/admin/business-partners', forgedAdminToken);
  assert(forged.response.status === 403, `Manipulierte JWT-Rolle wurde vertraut: HTTP ${forged.response.status}`);

  const ownUsers = await request('/api/admin/users?limit=100&page=1', assistantToken);
  assert(ownUsers.response.status === 200, `Mandanten-Benutzerverwaltung nicht erreichbar: HTTP ${ownUsers.response.status}`);
  const users = Array.isArray(ownUsers.body?.users) ? ownUsers.body.users : [];
  assert(users.every((user) => String(user.business_partner_id) === String(assistant.business_partner_id)), 'Benutzerliste enthält fremde Mandanten.');
  assert(users.every((user) => !['admin', 'assistenz'].includes(String(user.role).toLowerCase())), 'Benutzerliste enthält privilegierte Rollen.');

  const foreignLookup = await request(`/api/admin/users/${foreignUser.id}`, assistantToken);
  assert(foreignLookup.response.status === 404, `Fremder Benutzer ist direkt abrufbar: HTTP ${foreignLookup.response.status}`);

  const csrfFailure = await request('/api/users/me', null, {
    method: 'PUT',
    headers: { Cookie: `token=${assistantToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(csrfFailure.response.status === 403, `Cookie-Mutation ohne CSRF-Token wurde akzeptiert: HTTP ${csrfFailure.response.status}`);

  const health = await request('/api/health');
  assert(health.response.status === 200, 'Healthcheck ist nicht erreichbar.');
  assert(String(health.response.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'Content-Security-Policy fehlt.');
  assert(health.response.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options fehlt.');
  assert(Boolean(health.response.headers.get('x-frame-options')), 'Frame-Schutz fehlt.');

  checkStoredXssProtection();
  checkFrontendTokenStorage();
  console.log('[security-smoke] Rollen, Mandantengrenzen, CSRF, Header, XSS und Cookie-Session: OK');
}

run()
  .catch((error) => {
    console.error('[security-smoke] fehlgeschlagen:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
