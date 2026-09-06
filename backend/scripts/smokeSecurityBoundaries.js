const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sanitizeRichText } = require('../services/htmlSanitizer');
const authMiddleware = require('../middleware/authMiddleware');

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

async function createAccountBoundaryFixtures(assistant) {
  const foreignPartner = await db.query(
    `SELECT id
     FROM business_partners
     WHERE id <> $1
     ORDER BY id
     LIMIT 1`,
    [assistant.business_partner_id]
  );
  assert(foreignPartner.rowCount === 1, 'Für den Account-Mandantentest fehlt ein zweiter Mandant.');

  const ownAccount = await db.query(
    `INSERT INTO business_partner_accounts (business_partner_id, name, status, notes)
     VALUES ($1, $2, 'prospect', $3)
     RETURNING id, business_partner_id`,
    [assistant.business_partner_id, `Security Smoke Own ${Date.now()}`, 'Automatisch erzeugt; wird nach dem Test gelöscht.']
  );
  const foreignAccount = await db.query(
    `INSERT INTO business_partner_accounts (business_partner_id, name, status, notes)
     VALUES ($1, $2, 'prospect', $3)
     RETURNING id, business_partner_id`,
    [foreignPartner.rows[0].id, `Security Smoke Foreign ${Date.now()}`, 'Automatisch erzeugt; wird nach dem Test gelöscht.']
  );
  const foreignCompetitor = await db.query(
    `INSERT INTO business_partner_competitors (account_id, name, notes)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [foreignAccount.rows[0].id, `Security Smoke Competitor ${Date.now()}`, 'Automatisch erzeugt; wird nach dem Test gelöscht.']
  );
  const foreignContact = await db.query(
    `INSERT INTO business_partner_account_contacts (account_id, name, email)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [foreignAccount.rows[0].id, `Security Smoke Contact ${Date.now()}`, 'security-smoke@example.com']
  );

  return {
    ownAccountId: ownAccount.rows[0].id,
    foreignPartnerId: foreignPartner.rows[0].id,
    foreignAccountId: foreignAccount.rows[0].id,
    foreignCompetitorId: foreignCompetitor.rows[0].id,
    foreignContactId: foreignContact.rows[0].id,
  };
}

async function cleanupAccountBoundaryFixtures(fixtures) {
  if (!fixtures) return;
  const accountIds = [fixtures.ownAccountId, fixtures.foreignAccountId, fixtures.createdOwnAccountId].filter(Boolean);
  const competitorIds = [fixtures.foreignCompetitorId, fixtures.createdOwnCompetitorId].filter(Boolean);
  const contactIds = [fixtures.foreignContactId, fixtures.createdOwnContactId].filter(Boolean);
  if (contactIds.length > 0) {
    await db.query('DELETE FROM business_partner_account_contacts WHERE id = ANY($1::uuid[])', [contactIds]);
  }
  if (competitorIds.length > 0) {
    await db.query('DELETE FROM business_partner_competitors WHERE id = ANY($1::uuid[])', [competitorIds]);
  }
  if (accountIds.length > 0) {
    await db.query('DELETE FROM business_partner_accounts WHERE id = ANY($1::uuid[])', [accountIds]);
  }
}

async function checkAccountTenantBoundary(assistant, assistantToken) {
  const fixtures = await createAccountBoundaryFixtures(assistant);
  try {
    const ownList = await request(`/api/admin/accounts/for-bp/${assistant.business_partner_id}`, assistantToken);
    assert(ownList.response.status === 200, `Eigene Account-Liste nicht erreichbar: HTTP ${ownList.response.status}`);
    assert(Array.isArray(ownList.body), 'Eigene Account-Liste ist kein Array.');
    assert(ownList.body.some((account) => account.id === fixtures.ownAccountId), 'Eigener Account fehlt in der Account-Liste.');
    assert(ownList.body.every((account) => String(account.business_partner_id) === String(assistant.business_partner_id)), 'Account-Liste enthält fremde Mandanten.');

    const foreignList = await request(`/api/admin/accounts/for-bp/${fixtures.foreignPartnerId}`, assistantToken);
    assert(foreignList.response.status === 403, `Fremde Account-Liste ist erreichbar: HTTP ${foreignList.response.status}`);

    const ownAccount = await request(`/api/admin/accounts/${fixtures.ownAccountId}`, assistantToken);
    assert(ownAccount.response.status === 200, `Eigener Account ist nicht abrufbar: HTTP ${ownAccount.response.status}`);

    const createdAccount = await request(`/api/admin/accounts/for-bp/${assistant.business_partner_id}`, assistantToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Security Smoke API ${Date.now()}`, status: 'prospect', region_ids: [], category_ids: [] }),
    });
    assert(createdAccount.response.status === 201, `Mandantenassistenz kann keinen eigenen Account anlegen: HTTP ${createdAccount.response.status}`);
    fixtures.createdOwnAccountId = createdAccount.body?.id;
    assert(Boolean(fixtures.createdOwnAccountId), 'Neu angelegter Account enthält keine ID.');

    const updatedAccount = await request(`/api/admin/accounts/${fixtures.createdOwnAccountId}`, assistantToken, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Security Smoke API Updated', status: 'prospect', region_ids: [], category_ids: [] }),
    });
    assert(updatedAccount.response.status === 200, `Mandantenassistenz kann eigenen Account nicht ändern: HTTP ${updatedAccount.response.status}`);

    const createdCompetitor = await request(`/api/admin/competitors/for-account/${fixtures.createdOwnAccountId}`, assistantToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Security Smoke Own Competitor ${Date.now()}` }),
    });
    assert(createdCompetitor.response.status === 201, `Mandantenassistenz kann eigenen Wettbewerber nicht anlegen: HTTP ${createdCompetitor.response.status}`);
    fixtures.createdOwnCompetitorId = createdCompetitor.body?.id;

    const updatedCompetitor = await request(`/api/admin/competitors/${fixtures.createdOwnCompetitorId}`, assistantToken, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Security Smoke Own Competitor Updated' }),
    });
    assert(updatedCompetitor.response.status === 200, `Mandantenassistenz kann eigenen Wettbewerber nicht ändern: HTTP ${updatedCompetitor.response.status}`);

    const createdContact = await request(`/api/admin/accounts/${fixtures.createdOwnAccountId}/contacts`, assistantToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Security Smoke Kontakt', email: 'SECURITY-SMOKE@EXAMPLE.COM', is_primary: true }),
    });
    assert(createdContact.response.status === 201, `Mandantenassistenz kann eigenen Ansprechpartner nicht anlegen: HTTP ${createdContact.response.status}`);
    fixtures.createdOwnContactId = createdContact.body?.id;
    assert(createdContact.body?.email === 'security-smoke@example.com', 'Kontakt-E-Mail wurde nicht normalisiert.');

    const updatedContact = await request(`/api/admin/accounts/contacts/${fixtures.createdOwnContactId}`, assistantToken, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Security Smoke Kontakt aktualisiert', job_title: 'Test', is_primary: true }),
    });
    assert(updatedContact.response.status === 200, `Mandantenassistenz kann eigenen Ansprechpartner nicht ändern: HTTP ${updatedContact.response.status}`);

    const accountDetail = await request(`/api/admin/accounts/${fixtures.createdOwnAccountId}`, assistantToken);
    assert(accountDetail.response.status === 200, `Account-Detailansicht ist nicht erreichbar: HTTP ${accountDetail.response.status}`);
    assert(Array.isArray(accountDetail.body?.contacts), 'Account-Detailansicht enthält keine Ansprechpartner-Liste.');
    assert(accountDetail.body.contacts.some((contact) => contact.id === fixtures.createdOwnContactId), 'Neu angelegter Ansprechpartner fehlt in der Account-Detailansicht.');
    assert(Array.isArray(accountDetail.body?.competitors), 'Account-Detailansicht enthält keine Wettbewerber-Liste.');
    assert(accountDetail.body.competitors.some((competitor) => competitor.id === fixtures.createdOwnCompetitorId), 'Neu angelegter Wettbewerber fehlt in der Account-Detailansicht.');

    for (const [label, route, options] of [
      ['Account lesen', `/api/admin/accounts/${fixtures.foreignAccountId}`, {}],
      ['Account ändern', `/api/admin/accounts/${fixtures.foreignAccountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nicht erlaubt', status: 'prospect', region_ids: [], category_ids: [] }),
      }],
      ['Account löschen', `/api/admin/accounts/${fixtures.foreignAccountId}`, { method: 'DELETE' }],
      ['Wettbewerber auflisten', `/api/admin/competitors/for-account/${fixtures.foreignAccountId}`, {}],
      ['Wettbewerber anlegen', `/api/admin/competitors/for-account/${fixtures.foreignAccountId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nicht erlaubt' }),
      }],
      ['Wettbewerber ändern', `/api/admin/competitors/${fixtures.foreignCompetitorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nicht erlaubt' }),
      }],
      ['Wettbewerber löschen', `/api/admin/competitors/${fixtures.foreignCompetitorId}`, { method: 'DELETE' }],
      ['Ansprechpartner ändern', `/api/admin/accounts/contacts/${fixtures.foreignContactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nicht erlaubt' }),
      }],
      ['Ansprechpartner löschen', `/api/admin/accounts/contacts/${fixtures.foreignContactId}`, { method: 'DELETE' }],
    ]) {
      const result = await request(route, assistantToken, options);
      assert(result.response.status === 404, `${label} überschreitet die Mandantengrenze: HTTP ${result.response.status}`);
    }

    const deletedCompetitor = await request(`/api/admin/competitors/${fixtures.createdOwnCompetitorId}`, assistantToken, { method: 'DELETE' });
    assert(deletedCompetitor.response.status === 204, `Mandantenassistenz kann eigenen Wettbewerber nicht löschen: HTTP ${deletedCompetitor.response.status}`);
    fixtures.createdOwnCompetitorId = null;

    const deletedContact = await request(`/api/admin/accounts/contacts/${fixtures.createdOwnContactId}`, assistantToken, { method: 'DELETE' });
    assert(deletedContact.response.status === 204, `Mandantenassistenz kann eigenen Ansprechpartner nicht löschen: HTTP ${deletedContact.response.status}`);
    fixtures.createdOwnContactId = null;

    const deletedAccount = await request(`/api/admin/accounts/${fixtures.createdOwnAccountId}`, assistantToken, { method: 'DELETE' });
    assert(deletedAccount.response.status === 204, `Mandantenassistenz kann eigenen Account nicht löschen: HTTP ${deletedAccount.response.status}`);
    fixtures.createdOwnAccountId = null;
  } finally {
    await cleanupAccountBoundaryFixtures(fixtures);
  }
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

function checkDemoReadOnlyBoundary() {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const blocked = authMiddleware.__test.rejectDemoMutation({
    user: { role: 'demo' },
    method: 'PUT',
    originalUrl: '/api/users/me',
  }, response);
  assert(blocked === true && response.statusCode === 403, 'Demo-Benutzer kann Änderungen ausführen.');

  const getAllowed = authMiddleware.__test.rejectDemoMutation({
    user: { role: 'demo' },
    method: 'GET',
    originalUrl: '/api/data/account-intelligence',
  }, response);
  assert(getAllowed === false, 'Demo-Benutzer kann Inhalte nicht schreibgeschützt lesen.');

  const renewalAllowed = authMiddleware.__test.rejectDemoMutation({
    user: { role: 'demo' },
    method: 'POST',
    originalUrl: '/api/session/renew',
  }, response);
  assert(renewalAllowed === false, 'Demo-Sitzung kann nicht verlängert werden.');

  const logoutAllowed = authMiddleware.__test.rejectDemoMutation({
    user: { role: 'demo' },
    method: 'POST',
    originalUrl: '/api/auth/logout',
  }, response);
  assert(logoutAllowed === false, 'Demo-Benutzer kann sich nicht abmelden.');
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

  await checkAccountTenantBoundary(assistant, assistantToken);

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
  checkDemoReadOnlyBoundary();
  console.log('[security-smoke] Rollen, Benutzer- und Account-Mandantengrenzen, Demo-Nur-Lesen, CSRF, Header, XSS und Cookie-Session: OK');
}

run()
  .catch((error) => {
    console.error('[security-smoke] fehlgeschlagen:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
