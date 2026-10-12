const db = require('../config/db');
const controller = require('../controllers/platformUpdateController');
const { randomUUID } = require('node:crypto');

let updateId = null;
const partnerIds = [randomUUID(), randomUUID()];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function cleanup() {
  if (updateId) await db.query('DELETE FROM platform_updates WHERE id = $1', [updateId]);
  await db.query('DELETE FROM business_partners WHERE id = ANY($1::uuid[])', [partnerIds]);
}

async function run() {
  const admin = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY created_at LIMIT 1");
  assert(admin.rows[0], 'Kein aktiver Admin für den Plattform-Update-Test gefunden.');
  for (const [index, partnerId] of partnerIds.entries()) {
    await db.query(
      "INSERT INTO business_partners(id,name,slug,is_active,enabled_modules) VALUES($1,$2,$3,true,ARRAY['content'])",
      [partnerId, `Update Ziel ${index + 1}`, `update-target-${partnerId.slice(0, 8)}`]
    );
  }

  const createResponse = responseRecorder();
  await controller.create({
    user: { id: admin.rows[0].id },
    body: {
      title: `Plattform-Test ${Date.now()}`,
      summary: 'Kurztext für den automatisierten Funktionstest.',
      body: 'Dieser temporäre Eintrag prüft Entwurf, Veröffentlichung und öffentliche Ausgabe.',
      benefits: 'Der Update-Pfad bleibt nachvollziehbar.',
      modules: ['content', 'public_page'],
      action_required: true,
      action_text: 'Keine Aktion außerhalb des Tests erforderlich.',
      status: 'draft',
      audience_scope: 'selected',
      audience_partner_ids: [partnerIds[0]],
    },
  }, createResponse);
  assert(createResponse.statusCode === 201 && createResponse.body?.id, `Anlegen fehlgeschlagen (${createResponse.statusCode}).`);
  updateId = createResponse.body.id;
  assert(createResponse.body.status === 'draft' && createResponse.body.published_at === null, 'Entwurfsstatus ist inkonsistent.');

  const hiddenResponse = responseRecorder();
  await controller.publicList({ query: { partnerId: partnerIds[0] } }, hiddenResponse);
  assert(!hiddenResponse.body.some((item) => item.id === updateId), 'Entwurf ist öffentlich sichtbar.');

  const updateResponse = responseRecorder();
  await controller.update({
    user: { id: admin.rows[0].id },
    params: { id: updateId },
    body: {
      title: `${createResponse.body.title} bearbeitet`,
      summary: createResponse.body.summary,
      body: createResponse.body.body,
      benefits: createResponse.body.benefits,
      modules: createResponse.body.modules,
      image_url: '',
      action_required: true,
      action_text: createResponse.body.action_text,
      status: 'published',
      audience_scope: 'selected',
      audience_partner_ids: [partnerIds[0]],
    },
  }, updateResponse);
  assert(updateResponse.statusCode === 200 && updateResponse.body?.published_at, 'Veröffentlichung fehlgeschlagen.');

  const publicResponse = responseRecorder();
  await controller.publicList({ query: { partnerId: partnerIds[0] } }, publicResponse);
  const publicItem = publicResponse.body.find((item) => item.id === updateId);
  assert(publicItem, 'Veröffentlichter Beitrag fehlt in der öffentlichen Liste.');
  assert(publicItem.title.endsWith('bearbeitet'), 'Bearbeiteter Titel wurde nicht gespeichert.');
  assert(!Object.prototype.hasOwnProperty.call(publicItem, 'status'), 'Öffentliche Ausgabe enthält interne Statusdaten.');
  const excludedResponse = responseRecorder();
  await controller.publicList({ query: { partnerId: partnerIds[1] } }, excludedResponse);
  assert(!excludedResponse.body.some((item) => item.id === updateId), 'Ausgeschlossener Mandant sieht den ausgewählten Beitrag.');

  const globalResponse = responseRecorder();
  await controller.update({
    user: { id: admin.rows[0].id }, params: { id: updateId },
    body: { ...updateResponse.body, audience_scope: 'all', audience_partner_ids: [] },
  }, globalResponse);
  assert(globalResponse.statusCode === 200 && globalResponse.body.audience_scope === 'all', 'Umstellung auf alle Mandanten fehlgeschlagen.');
  const visibleForAll = responseRecorder();
  await controller.publicList({ query: { partnerId: partnerIds[1] } }, visibleForAll);
  assert(visibleForAll.body.some((item) => item.id === updateId), 'Globaler Beitrag fehlt beim zweiten Mandanten.');

  const adminList = responseRecorder();
  await controller.list({}, adminList);
  const listed = adminList.body.find((item) => item.id === updateId);
  assert(listed && listed.audience_scope === 'all' && Array.isArray(listed.audience_partner_ids), 'Admin-Liste enthält die Zielgruppe nicht vollständig.');

  const deleteResponse = responseRecorder();
  await controller.remove({ params: { id: updateId } }, deleteResponse);
  assert(deleteResponse.statusCode === 200, 'Löschen fehlgeschlagen.');
  const remaining = await db.query('SELECT COUNT(*)::int AS count FROM platform_updates WHERE id = $1', [updateId]);
  assert(remaining.rows[0].count === 0, 'Temporärer Plattform-Eintrag wurde nicht entfernt.');
  updateId = null;

  console.log('Plattform-Updates: Mandantenzielgruppe, Bearbeiten, Veröffentlichung, öffentliche Ausgabe und Löschen OK.');
}

run()
  .catch((error) => {
    console.error('[smoke:platform-updates]', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await cleanup(); } finally { await db.end(); }
  });
