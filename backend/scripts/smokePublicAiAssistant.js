const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { retrieveTenantInternalDocuments } = require('../services/internalAiRetrievalService');
const { normalizeOrigin, expandOriginVariants, __test } = require('../services/publicAiAssistantService');

const BASE_URL = String(process.env.PUBLIC_AI_SMOKE_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, token, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.headers || {}) }
      : { Accept: 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_error) { body = text; }
  return { response, body };
}

async function run() {
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    throw new Error('Der Public-AI-Smoke-Test darf nicht in Produktion laufen.');
  }
  assert(process.env.JWT_SECRET, 'JWT_SECRET fehlt.');

  const tables = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [[
    'public_ai_assistant_settings',
    'public_ai_documents',
    'public_ai_usage',
    'public_ai_response_cache',
  ]]);
  assert(tables.rowCount === 4, 'Public-AI-Datenmodell ist unvollständig.');
  const avatarColumn = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'public_ai_assistant_settings'
      AND column_name = 'avatar_key'
  `);
  assert(avatarColumn.rowCount === 1, 'Avatar-Auswahl im Public-AI-Datenmodell fehlt.');

  assert(__test.isPrivateIp('127.0.0.1'), 'Loopback-Adresse wird nicht als privat erkannt.');
  assert(__test.isPrivateIp('10.1.2.3'), 'Privates IPv4-Netz wird nicht erkannt.');
  assert(!__test.isPrivateIp('1.1.1.1'), 'Öffentliche IPv4-Adresse wird fälschlich blockiert.');
  assert(normalizeOrigin('https://example.org/') === 'https://example.org', 'Origin-Normalisierung ist fehlerhaft.');
  assert(expandOriginVariants('https://example.org', 'https://www.example.org').includes('https://www.example.org'), 'www-Origin wird nicht automatisch ergänzt.');
  assert(expandOriginVariants('https://www.example.org', 'https://example.org').includes('https://example.org'), 'Origin ohne www wird nicht automatisch ergänzt.');
  assert(expandOriginVariants('https://portal.example.org', 'https://example.org').length === 1, 'Fremde Subdomains werden ungewollt erweitert.');
  assert(__test.sanitizeHistory(new Array(20).fill({ role: 'user', content: 'x' })).length === 8, 'Chatverlauf wird nicht begrenzt.');
  assert(__test.chunkContent('Testinhalt. '.repeat(500)).length > 1, 'Homepage-Inhalte werden nicht in Abschnitte geteilt.');
  const contactFallback = __test.appendContactLinkForInsufficientAnswer(
    'Die bereitgestellten Quellen enthalten keine Informationen dazu.',
    'https://example.org/kontakt'
  );
  assert(contactFallback.includes('[Kontaktmöglichkeit auf der Website](https://example.org/kontakt)'), 'Kontaktlink fehlt bei unzureichender Quellenlage.');

  const assistantResult = await db.query(`
    SELECT id, business_partner_id, auth_version
    FROM users
    WHERE LOWER(role) = 'assistenz'
      AND is_active = true
      AND business_partner_id IS NOT NULL
      AND (active_until IS NULL OR active_until > NOW())
    LIMIT 1
  `);
  assert(assistantResult.rowCount === 1, 'Für den Public-AI-Test fehlt eine aktive Mandantenassistenz.');
  const assistant = assistantResult.rows[0];
  const token = jwt.sign({ sub: assistant.id, av: Number(assistant.auth_version || 0) }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });

  const foreignPartner = await db.query('SELECT id FROM business_partners WHERE id <> $1 LIMIT 1', [assistant.business_partner_id]);
  assert(foreignPartner.rowCount === 1, 'Für den Mandantengrenztest fehlt ein zweiter Mandant.');

  const own = await request('/api/admin/public-assistant', token);
  assert(own.response.status === 200, `Eigene Public-AI-Einstellungen nicht erreichbar: HTTP ${own.response.status}`);
  assert(String(own.body.business_partner_id) === String(assistant.business_partner_id), 'Assistenz erhält nicht den eigenen Mandanten.');
  assert(!('embed_code' in own.body), 'Assistenz erhält den externen Einbettungscode.');
  assert(!('site_key' in own.body), 'Assistenz erhält den Schlüssel des externen Einbettungscodes.');
  assert(!('allowed_origins' in own.body), 'Assistenz erhält die externe Domain-Allowlist.');
  assert(['female', 'male'].includes(own.body.avatar_key), 'Assistenz erhält keine gültige Avatar-Auswahl.');

  const rotate = await request('/api/admin/public-assistant/rotate-site-key', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(rotate.response.status === 403, `Assistenz kann den Einbettungsschlüssel erneuern: HTTP ${rotate.response.status}`);

  const attemptedForeign = await request(`/api/admin/public-assistant?businessPartnerId=${foreignPartner.rows[0].id}`, token);
  assert(attemptedForeign.response.status === 200, `Mandantengrenztest liefert HTTP ${attemptedForeign.response.status}`);
  assert(String(attemptedForeign.body.business_partner_id) === String(assistant.business_partner_id), 'Assistenz kann fremde Public-AI-Einstellungen auswählen.');

  const adminResult = await db.query(`
    SELECT id, auth_version
    FROM users
    WHERE LOWER(role) = 'admin'
      AND is_active = true
      AND (active_until IS NULL OR active_until > NOW())
    LIMIT 1
  `);
  assert(adminResult.rowCount === 1, 'Für den Einbettungscode-Test fehlt ein aktiver Admin.');
  const admin = adminResult.rows[0];
  const adminToken = jwt.sign({ sub: admin.id, av: Number(admin.auth_version || 0) }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });
  const adminSettings = await request(`/api/admin/public-assistant?businessPartnerId=${assistant.business_partner_id}`, adminToken);
  assert(adminSettings.response.status === 200, `Admin-Einstellungen nicht erreichbar: HTTP ${adminSettings.response.status}`);
  assert(typeof adminSettings.body.embed_code === 'string' && adminSettings.body.embed_code.includes('assistant-embed.js'), 'Admin erhält keinen Einbettungscode.');
  assert(typeof adminSettings.body.site_key === 'string', 'Admin erhält keinen Einbettungsschlüssel.');
  assert(Array.isArray(adminSettings.body.allowed_origins), 'Admin erhält keine Domain-Allowlist.');
  assert(['female', 'male'].includes(adminSettings.body.avatar_key), 'Admin erhält keine gültige Avatar-Auswahl.');

  const documents = await retrieveTenantInternalDocuments('Mobilität', assistant.business_partner_id, 8);
  const expertIds = documents.filter((document) => document.type === 'user').map((document) => document.id);
  if (expertIds.length) {
    const foreignExperts = await db.query(`
      SELECT COUNT(*)::int AS count FROM users
      WHERE id = ANY($1::uuid[]) AND business_partner_id <> $2
    `, [expertIds, assistant.business_partner_id]);
    assert(foreignExperts.rows[0].count === 0, 'Interne KI-Suche liefert Experten eines fremden Mandanten.');
  }
  const homepageDocumentIds = documents.filter((document) => document.type === 'tenant_homepage').map((document) => document.id);
  if (homepageDocumentIds.length) {
    const foreignHomepageDocuments = await db.query(`
      SELECT COUNT(*)::int AS count FROM public_ai_documents
      WHERE id = ANY($1::uuid[]) AND business_partner_id <> $2
    `, [homepageDocumentIds, assistant.business_partner_id]);
    assert(foreignHomepageDocuments.rows[0].count === 0, 'Interne KI-Suche liefert Homepage-Inhalte eines fremden Mandanten.');
  }

  const oversizedInternalQuestion = await request('/api/data/ai-ask', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'x'.repeat(501) }),
  });
  assert(oversizedInternalQuestion.response.status === 400, `Interne KI akzeptiert mehr als 500 Zeichen: HTTP ${oversizedInternalQuestion.response.status}`);

  const temporarySession = await db.query(
    'INSERT INTO ai_chat_sessions (user_id) VALUES ($1) RETURNING id',
    [assistant.id]
  );
  const temporarySessionId = temporarySession.rows[0].id;
  await db.query(
    `INSERT INTO ai_chat_messages (session_id, role, content) VALUES ($1, 'user', 'Smoke-Test')`,
    [temporarySessionId]
  );
  const deleteConversation = await request(`/api/data/ai-chat-sessions/${temporarySessionId}`, token, { method: 'DELETE' });
  assert(deleteConversation.response.status === 204, `Eigener KI-Verlauf kann nicht gelöscht werden: HTTP ${deleteConversation.response.status}`);
  const deletedConversation = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM ai_chat_sessions WHERE id = $1) AS sessions,
      (SELECT COUNT(*)::int FROM ai_chat_messages WHERE session_id = $1) AS messages
  `, [temporarySessionId]);
  assert(deletedConversation.rows[0].sessions === 0 && deletedConversation.rows[0].messages === 0, 'Gelöschter KI-Verlauf ist weiterhin gespeichert.');

  const config = await request(`/api/public/assistant/${adminSettings.body.site_key}/config`);
  assert([200, 404].includes(config.response.status), `Public-Konfiguration liefert unerwartet HTTP ${config.response.status}`);
  if (config.response.status === 200) {
    assert(!('allowed_origins' in config.body), 'Public-Konfiguration veröffentlicht die Origin-Allowlist.');
    assert(!('business_partner_id' in config.body), 'Public-Konfiguration veröffentlicht interne Mandanten-IDs.');
    assert(['/ki-avatar-w.png', '/ki-avatar-m.png'].includes(config.body.avatarUrl), 'Public-Konfiguration liefert keinen gültigen Assistenten-Avatar.');
  }

  console.log('[public-ai-smoke] Datenmodell, SSRF-Basis, Limits, Rollen- und Mandantengrenzen: OK');
}

run()
  .catch((error) => {
    console.error('[public-ai-smoke] fehlgeschlagen:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
