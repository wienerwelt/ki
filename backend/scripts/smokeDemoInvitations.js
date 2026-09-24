const crypto = require('crypto');
const db = require('../config/db');

const API_BASE_URL = String(process.env.API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const password = `Demo-Smoke-${crypto.randomBytes(12).toString('hex')}!`;
const email = `demo-smoke-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.invalid`;

let capturedEmailHtml = '';
let userId = null;
let partnerId = null;

const emailService = require('../services/emailService');
emailService.sendEmail = async ({ html }) => {
  capturedEmailHtml = String(html || '');
  return { messageId: 'demo-smoke-local' };
};

const controller = require('../controllers/demoInvitationController');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }
  return { response, body };
}

function sessionToken(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookie = values.find((value) => String(value).startsWith('token='));
  return cookie ? String(cookie).split(';')[0].slice('token='.length) : '';
}

async function cleanup() {
  if (!userId && !partnerId) return;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (userId) {
      await client.query('DELETE FROM activity_log WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM demo_invitations WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM dashboard_configurations WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1 AND role = \'demo\'', [userId]);
    }
    if (partnerId) {
      await client.query(
        'DELETE FROM business_partners WHERE id = $1 AND is_demo_tenant = TRUE',
        [partnerId]
      );
    }
    await client.query('COMMIT');
    const remaining = await client.query(
      "SELECT COUNT(1)::int AS count FROM users WHERE email = $1 OR business_partner_id = $2",
      [email, partnerId]
    );
    assert(remaining.rows[0].count === 0, 'Temporäre Demo-Testdaten wurden nicht vollständig entfernt.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[smoke:demo-invitations] Aufraeumen fehlgeschlagen:', error.message);
  } finally {
    client.release();
  }
}

async function run() {
  const adminResult = await db.query(
    "SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY created_at LIMIT 1"
  );
  assert(adminResult.rows[0], 'Kein aktiver Admin fuer den Einladungs-Smoke-Test gefunden.');

  const createRes = responseRecorder();
  await controller.create({
    user: { id: adminResult.rows[0].id },
    body: {
      email,
      first_name: 'Demo',
      last_name: 'Smoke',
      organization_name: 'Demo Smoke Organisation',
      scenario: 'both',
      days: 7,
    },
  }, createRes);
  assert(createRes.statusCode === 201, `Einladung fehlgeschlagen (${createRes.statusCode}).`);

  const created = await db.query(
    `SELECT u.id AS user_id, u.business_partner_id, u.is_active, u.role,
            bp.is_demo_tenant, bp.demo_scenario, bp.enabled_modules,
            i.id AS invitation_id, i.delivery_status
     FROM users u
     JOIN business_partners bp ON bp.id = u.business_partner_id
     JOIN demo_invitations i ON i.user_id = u.id
     WHERE LOWER(u.email) = $1
     ORDER BY i.created_at DESC LIMIT 1`,
    [email]
  );
  const record = created.rows[0];
  assert(record, 'Demo-Benutzer oder Einladung wurde nicht gespeichert.');
  userId = record.user_id;
  partnerId = record.business_partner_id;
  assert(record.role === 'demo' && record.is_demo_tenant === true, 'Demo-Isolation fehlt.');
  assert(record.is_active === false, 'Demo-Zugang ist vor Annahme bereits aktiv.');
  assert(record.demo_scenario === 'both', 'Demo-Szenario wurde nicht gespeichert.');
  assert(record.delivery_status === 'sent', 'Einladungsstatus wurde nicht auf gesendet gesetzt.');
  assert(record.enabled_modules.includes('content') && record.enabled_modules.includes('sales'), 'Demo-Module sind unvollstaendig.');

  const sampleResult = await db.query(
    `SELECT COUNT(DISTINCT account.id)::int AS accounts,
            COUNT(article.id)::int AS signals
     FROM business_partner_accounts account
     LEFT JOIN business_partner_tracked_articles article ON article.account_id = account.id
     WHERE account.business_partner_id = $1`,
    [partnerId]
  );
  assert(sampleResult.rows[0].accounts === 3 && sampleResult.rows[0].signals === 3, 'Sales-Demodaten fehlen.');

  const tokenMatch = capturedEmailHtml.match(/#token=([a-f0-9]{64})/i);
  assert(tokenMatch, 'Einmaliger Aktivierungs-Token fehlt in der E-Mail.');
  const token = tokenMatch[1];

  const inspect = await jsonRequest('/api/auth/demo-invitations/inspect', {
    method: 'POST', body: JSON.stringify({ token }),
  });
  assert(inspect.response.status === 200 && inspect.body?.scenario === 'both', 'Einladung kann nicht geprueft werden.');

  const accept = await jsonRequest('/api/auth/demo-invitations/accept', {
    method: 'POST', body: JSON.stringify({ token, password }),
  });
  assert(accept.response.status === 200, `Aktivierung fehlgeschlagen (${accept.response.status}).`);

  const reuse = await jsonRequest('/api/auth/demo-invitations/accept', {
    method: 'POST', body: JSON.stringify({ token, password }),
  });
  assert(reuse.response.status === 410, 'Einladungstoken kann mehrfach verwendet werden.');

  const login = await jsonRequest('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier: email, password }),
  });
  assert(login.response.status === 200 && login.body?.user?.role === 'demo', 'Demo-Login fehlgeschlagen.');
  const jwt = sessionToken(login.response);
  assert(jwt, 'Login hat kein Sitzungstoken gesetzt.');
  const authHeaders = { Authorization: `Bearer ${jwt}` };

  const read = await jsonRequest('/api/data/account-intelligence?limitPerGroup=5&periodDays=30', {
    headers: authHeaders,
  });
  assert(read.response.status === 200, `Erlaubter Demo-Lesezugriff fehlgeschlagen (${read.response.status}).`);

  const mutation = await jsonRequest('/api/data/content/00000000-0000-4000-8000-000000000000/vote', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ vote: 1, contentType: 'scraped_content' }),
  });
  assert(mutation.response.status === 403 && /Demo-Modus/i.test(String(mutation.body?.message)), 'Demo-Schreibschutz greift nicht.');

  const exportAttempt = await jsonRequest('/api/account-radar/exports/accounts.csv', {
    headers: authHeaders,
  });
  assert(exportAttempt.response.status === 403, 'Demo-Export ist nicht gesperrt.');

  const revokeRes = responseRecorder();
  await controller.revoke({ params: { id: record.invitation_id } }, revokeRes);
  assert(revokeRes.statusCode === 200, 'Demo-Zugang konnte nicht widerrufen werden.');

  const revokedRead = await jsonRequest('/api/data/account-intelligence?limitPerGroup=5&periodDays=30', {
    headers: authHeaders,
  });
  assert(revokedRead.response.status === 401, 'Bestehende Sitzung bleibt nach Widerruf aktiv.');

  const revokedLogin = await jsonRequest('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier: email, password }),
  });
  assert(revokedLogin.response.status === 403, 'Widerruf sperrt den erneuten Login nicht.');

  console.log('Demo-Einladungen: Isolation, Aktivierung, Einmal-Token, Login, Lesezugriff, Schreib-/Exportsperre und Widerruf OK.');
}

run()
  .catch((error) => {
    console.error('[smoke:demo-invitations]', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await db.end();
  });
