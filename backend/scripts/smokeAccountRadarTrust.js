const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const {
  createRadarManagementPdf,
  getViennaClock,
  isDue,
} = require('../services/accountRadarDigestService');
const { retrieveTenantInternalDocuments } = require('../services/internalAiRetrievalService');
const { getAccountRadarAnalytics } = require('../services/accountRadarAnalyticsService');

async function main() {
  const [votesResult, aggregateResult, jobResult, tablesResult, workflowColumnsResult, salesColumnsResult, accountOwnerResult] = await Promise.all([
    db.query(`
      SELECT COUNT(*)::integer AS total,
             COUNT(DISTINCT ROW(source_id, user_id))::integer AS unique_pairs
      FROM source_votes
    `),
    db.query(`
      SELECT COUNT(*)::integer AS mismatches
      FROM sources source
      WHERE COALESCE(source.vote_count, 0) <> (
        SELECT COUNT(*) FROM source_votes vote WHERE vote.source_id = source.id
      )
    `),
    db.query(`
      SELECT COUNT(*)::integer AS jobs
      FROM cronjobs
      WHERE name = 'account-radar-digest' AND is_active = TRUE
    `),
    db.query(`
      SELECT COUNT(*)::integer AS tables
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'source_votes',
          'account_radar_settings',
          'account_radar_digest_recipients',
          'account_radar_digest_deliveries',
          'account_radar_tasks',
          'account_radar_task_events',
          'account_radar_signal_feedback'
        )
    `),
    db.query(`
      SELECT COUNT(*)::integer AS columns
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'account_intelligence_item_status'
        AND column_name IN ('action_type', 'follow_up_at', 'note', 'action_updated_at')
    `),
    db.query(`
      SELECT COUNT(*)::integer AS columns
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'account_radar_tasks'
        AND column_name IN ('sales_stage', 'sales_stage_updated_at', 'contact_id', 'contact_channel',
                            'priority', 'opportunity_value_eur', 'opportunity_probability', 'first_contact_at')
    `),
    db.query(`
      SELECT COUNT(*)::integer AS columns
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'business_partner_accounts'
        AND column_name = 'owner_user_id'
    `),
  ]);

  const votes = votesResult.rows[0];
  if (votes.total !== votes.unique_pairs) throw new Error('Community-Trust enthält doppelte Nutzer-/Quellenpaare.');
  if (aggregateResult.rows[0].mismatches !== 0) throw new Error('Aggregierte Community-Trust-Zähler sind inkonsistent.');
  if (jobResult.rows[0].jobs !== 1) throw new Error('Der Account-Radar-Digest-Job fehlt oder ist doppelt.');
  if (tablesResult.rows[0].tables !== 7) throw new Error('Mindestens eine neue Account-Radar-Tabelle fehlt.');
  if (workflowColumnsResult.rows[0].columns !== 4) throw new Error('Die Account-Radar-Workflow-Felder fehlen.');
  if (salesColumnsResult.rows[0].columns !== 8) throw new Error('Die Account-Radar-Vertriebs- oder Opportunity-Felder fehlen.');
  if (accountOwnerResult.rows[0].columns !== 1) throw new Error('Die Account-Verantwortung fehlt.');

  const clock = getViennaClock(new Date('2026-09-07T06:10:00Z'));
  if (!isDue({
    digest_frequency: 'weekdays',
    delivery_hour: clock.hour,
    weekly_day: 1,
    sales_plan: 'premium',
  }, clock)) {
    throw new Error('Werktägliche Radar-Fälligkeit wird nicht korrekt erkannt.');
  }
  if (isDue({ digest_frequency: 'off', delivery_hour: clock.hour, weekly_day: 1 }, clock)) {
    throw new Error('Deaktivierter Radar-Versand darf nie fällig sein.');
  }

  const managementPdf = await createRadarManagementPdf({
    partner: { name: 'Demo AG', color_scheme: { primary_color: '#e31b23' } },
    signals: [{
      account_name: 'Demo Fuhrpark GmbH',
      article_title: 'Fuhrparkverband · Beitrag von Michael Närr - LinkedIn',
      article_url: 'https://www.linkedin.com/',
      source_name: 'LinkedIn',
      signal_type: 'Entscheider-Signal',
      relevance_score: 91,
      sales_stage: 'contacted',
      recommended_action: 'Kontakt mit Bezug auf den Beitrag aufnehmen.',
      published_at: new Date().toISOString(),
    }],
  });
  if (!Buffer.isBuffer(managementPdf)
      || managementPdf.length < 1000
      || managementPdf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('Die Account-Radar-Management-PDF ist ungültig.');
  }

  const { rows: staffRows } = await db.query(`
    SELECT id, business_partner_id, auth_version
    FROM users
    WHERE is_active = TRUE
      AND business_partner_id IS NOT NULL
      AND LOWER(role) IN ('admin', 'assistenz')
      AND (active_until IS NULL OR active_until >= CURRENT_DATE)
    ORDER BY CASE WHEN LOWER(role) = 'admin' THEN 0 ELSE 1 END, created_at
    LIMIT 1
  `);
  if (!staffRows[0]) throw new Error('Kein aktiver Mandantenmitarbeiter für den API-Smoke-Test gefunden.');
  const token = jwt.sign(
    { sub: staffRows[0].id, av: Number(staffRows[0].auth_version || 0) },
    process.env.JWT_SECRET,
    { expiresIn: '5m', algorithm: 'HS256' }
  );
  const headers = { Authorization: `Bearer ${token}` };
  const [trustResponse, settingsResponse, radarTeamResponse, radarResponse, accountTeamResponse] = await Promise.all([
    fetch('http://127.0.0.1:5000/api/sources/community-trust', { headers }),
    fetch('http://127.0.0.1:5000/api/account-radar/settings', { headers }),
    fetch('http://127.0.0.1:5000/api/data/account-intelligence/team', { headers }),
    fetch('http://127.0.0.1:5000/api/data/account-intelligence?limitPerGroup=5&periodDays=30', { headers }),
    fetch(`http://127.0.0.1:5000/api/admin/accounts/for-bp/${staffRows[0].business_partner_id}/team`, { headers }),
  ]);
  if (!trustResponse.ok || !Array.isArray(await trustResponse.json())) {
    throw new Error(`Community-Trust-API antwortet nicht korrekt (${trustResponse.status}).`);
  }
  const settingsPayload = await settingsResponse.json();
  if (!settingsResponse.ok || !settingsPayload.settings || !Array.isArray(settingsPayload.staff)) {
    throw new Error(`Account-Radar-Einstellungs-API antwortet nicht korrekt (${settingsResponse.status}).`);
  }
  if (!radarTeamResponse.ok || !Array.isArray(await radarTeamResponse.json())) {
    throw new Error(`Account-Radar-Team-API antwortet nicht korrekt (${radarTeamResponse.status}).`);
  }
  if (!radarResponse.ok || !Array.isArray(await radarResponse.json())) {
    throw new Error(`Account-Radar-Daten-API antwortet nicht korrekt (${radarResponse.status}).`);
  }
  if (!accountTeamResponse.ok || !Array.isArray(await accountTeamResponse.json())) {
    throw new Error(`Account-Verantwortungs-Team-API antwortet nicht korrekt (${accountTeamResponse.status}).`);
  }

  const smokeAccountName = `__Account-Radar-Smoke-${randomUUID()}`;
  try {
    const importHeaders = [
      'Account-ID', 'Name', 'Website', 'LinkedIn', 'Logo-URL', 'Status', 'Notizen', 'Aktiv',
      'Adresse', 'Zentrale E-Mail', 'Zentrales Telefon', 'Ansprechpartner-ID', 'Ansprechpartner',
      'Funktion', 'Kontakt-E-Mail', 'Kontakt-Telefon', 'Kontakt-LinkedIn', 'Kontakt-Notizen', 'Primärkontakt',
    ];
    const importRow = [
      '', smokeAccountName, 'https://example.com', '', '', 'Interessent', "'=1+1", 'Ja',
      'Musterstraße 1, 1010 Wien', 'office@example.invalid', '+43 1 123456', '', 'Max Mustermann',
      'Einkauf', 'max.mustermann@example.invalid', '+43 1 123456-10', '', '', 'Ja',
    ];
    const form = new FormData();
    form.append('file', new Blob([
      `${importHeaders.join(';')}\n${importRow.join(';')}\n`,
    ], { type: 'text/csv' }), 'account-radar-smoke.csv');
    form.append('overwrite', 'false');
    const importResponse = await fetch('http://127.0.0.1:5000/api/account-radar/accounts/import', {
      method: 'POST',
      headers,
      body: form,
    });
    const importPayload = await importResponse.json();
    if (importResponse.status !== 201
        || importPayload.created !== 1
        || importPayload.contacts_created !== 1
        || importPayload.invalid !== 0) {
      throw new Error(`Account-Import-API ist fehlerhaft (${importResponse.status}): ${JSON.stringify(importPayload)}`);
    }
    const importedResult = await db.query(
      `SELECT COUNT(*)::integer AS count,
              COUNT(contact.id)::integer AS contacts
       FROM business_partner_accounts account
       LEFT JOIN business_partner_account_contacts contact ON contact.account_id = account.id
       WHERE account.business_partner_id = $1 AND account.name = $2`,
      [staffRows[0].business_partner_id, smokeAccountName]
    );
    if (importedResult.rows[0].count !== 1 || importedResult.rows[0].contacts !== 1) {
      throw new Error('Importierter Account oder Ansprechpartner ist nicht korrekt mandantengebunden.');
    }
    const accountExportResponse = await fetch('http://127.0.0.1:5000/api/account-radar/exports/accounts.csv', { headers });
    const accountExport = await accountExportResponse.text();
    if (!accountExportResponse.ok
        || !accountExportResponse.headers.get('content-type')?.includes('text/csv')
        || !accountExport.includes(smokeAccountName)
        || !accountExport.includes('Max Mustermann')
        || !accountExport.includes("'=1+1")) {
      throw new Error(`Mandantensicherer Account-/Kontakt-Export ist fehlerhaft (${accountExportResponse.status}): ${JSON.stringify({
        contentType: accountExportResponse.headers.get('content-type'),
        account: accountExport.includes(smokeAccountName),
        contact: accountExport.includes('Max Mustermann'),
        formulaGuard: accountExport.includes("'=1+1"),
        sample: accountExport.slice(Math.max(0, accountExport.indexOf(smokeAccountName) - 40), accountExport.indexOf(smokeAccountName) + 240),
      })}`);
    }
  } finally {
    await db.query(
      `DELETE FROM business_partner_accounts
       WHERE business_partner_id = $1 AND name = $2`,
      [staffRows[0].business_partner_id, smokeAccountName]
    );
  }

  const smokeSourceId = randomUUID();
  try {
    await db.query(
      `INSERT INTO sources (id, url, description, suggested_by_user_id, status)
       VALUES ($1, $2, 'Temporärer Community-Trust-Smoke-Test', $3, 'approved')`,
      [smokeSourceId, `https://community-trust-smoke-${smokeSourceId}.invalid`, staffRows[0].id]
    );
    const submitVote = (rating) => fetch(`http://127.0.0.1:5000/api/sources/${smokeSourceId}/vote`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    const firstVoteResponse = await submitVote(4);
    const firstVote = await firstVoteResponse.json();
    if (firstVoteResponse.status !== 201 || firstVote.isFirstVote !== true) {
      throw new Error(`Erste Community-Trust-Stimme ist fehlerhaft (${firstVoteResponse.status}).`);
    }
    const updatedVoteResponse = await submitVote(5);
    const updatedVote = await updatedVoteResponse.json();
    if (updatedVoteResponse.status !== 200 || updatedVote.isFirstVote !== false) {
      throw new Error(`Community-Trust-Änderung ist fehlerhaft (${updatedVoteResponse.status}).`);
    }
    const lifecycleResult = await db.query(
      `SELECT
          (SELECT COUNT(*)::integer FROM source_votes WHERE source_id = $1) AS votes,
          (SELECT MAX(rating)::integer FROM source_votes WHERE source_id = $1) AS rating,
          (SELECT COUNT(*)::integer FROM user_score_logs WHERE reference_id = $1 AND action_type = 'SOURCE_VOTE') AS point_logs`,
      [smokeSourceId]
    );
    const lifecycle = lifecycleResult.rows[0];
    if (lifecycle.votes !== 1 || lifecycle.rating !== 5 || lifecycle.point_logs !== 1) {
      throw new Error('Community-Trust-Upsert oder einmalige Punktevergabe ist inkonsistent.');
    }
  } finally {
    const pointsResult = await db.query(
      `SELECT COALESCE(SUM(points_change), 0)::integer AS points
       FROM user_score_logs
       WHERE reference_id = $1`,
      [smokeSourceId]
    );
    await db.query('DELETE FROM user_score_logs WHERE reference_id = $1', [smokeSourceId]);
    await db.query('DELETE FROM sources WHERE id = $1', [smokeSourceId]);
    if (pointsResult.rows[0].points > 0) {
      await db.query(
        'UPDATE users SET contribution_score = GREATEST(0, contribution_score - $1) WHERE id = $2',
        [pointsResult.rows[0].points, staffRows[0].id]
      );
    }
  }

  const workflowAccountId = randomUUID();
  const workflowArticleId = randomUUID();
  const workflowContactId = randomUUID();
  try {
    await db.query(
      `INSERT INTO business_partner_accounts (id, business_partner_id, name, status, notes, owner_user_id)
       VALUES ($1, $2, $3, 'prospect', 'Temporärer Workflow-Smoke-Test', $4)`,
      [workflowAccountId, staffRows[0].business_partner_id, `__Radar-Workflow-${workflowAccountId}`, staffRows[0].id]
    );
    await db.query(
      `INSERT INTO business_partner_account_contacts
          (id, account_id, name, job_title, email, is_primary, created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, 'Erika Muster', 'Fuhrparkleitung', 'erika.muster@example.invalid', TRUE, $3, $3)`,
      [workflowContactId, workflowAccountId, staffRows[0].id]
    );
    await db.query(
      `INSERT INTO business_partner_tracked_articles
          (id, account_id, article_title, article_url, source_name, published_at, summary)
       VALUES ($1, $2, 'Temporäres Radar-Signal', $3, 'smoke.invalid', NOW(), 'Workflow-Test')`,
      [workflowArticleId, workflowAccountId, `https://workflow-smoke-${workflowArticleId}.invalid`]
    );
    const followUpAt = new Date(Date.now() + 86_400_000).toISOString();
    const invalidChannelResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/workflow`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'contact_planned',
        follow_up_at: followUpAt,
        contact_channel: 'carrier_pigeon',
      }),
    });
    if (invalidChannelResponse.status !== 400) {
      throw new Error('Der Account-Radar akzeptiert einen nicht freigegebenen Kontaktkanal.');
    }
    const workflowResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/workflow`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'contact_planned',
        follow_up_at: followUpAt,
        note: 'Gemeinsame Testnotiz',
        assigned_user_id: staffRows[0].id,
        sales_stage: 'contacted',
        contact_id: workflowContactId,
        contact_channel: 'email',
        priority: 'high',
        opportunity_value_eur: 25000,
        opportunity_probability: 35,
      }),
    });
    const workflowPayload = await workflowResponse.json();
    if (workflowResponse.status !== 200
        || workflowPayload.action_type !== 'contact_planned'
        || workflowPayload.workflow_note !== 'Gemeinsame Testnotiz'
        || workflowPayload.assigned_user_id !== staffRows[0].id
        || workflowPayload.sales_stage !== 'contacted'
        || workflowPayload.contact_id !== workflowContactId
        || workflowPayload.contact_channel !== 'email'
        || workflowPayload.priority !== 'high'
        || Number(workflowPayload.opportunity_value_eur) !== 25000
        || workflowPayload.opportunity_probability !== 35
        || !workflowPayload.first_contact_at
        || workflowPayload.contact_name !== 'Erika Muster'
        || !workflowPayload.task_id) {
      throw new Error(`Account-Radar-Workflow-API ist fehlerhaft (${workflowResponse.status}).`);
    }
    const workflowResult = await db.query(
      `SELECT task.task_status, task.action_type, task.note, task.assigned_user_id, task.sales_stage,
              task.contact_id, task.contact_channel, task.priority, task.opportunity_value_eur,
              task.opportunity_probability, task.first_contact_at,
              (SELECT COUNT(*)::integer FROM account_radar_task_events event WHERE event.task_id = task.id) AS events
       FROM account_radar_tasks task
       WHERE task.business_partner_id = $1 AND task.tracked_article_id = $2`,
      [staffRows[0].business_partner_id, workflowArticleId]
    );
    if (workflowResult.rows[0]?.task_status !== 'open'
        || workflowResult.rows[0]?.action_type !== 'contact_planned'
        || workflowResult.rows[0]?.note !== 'Gemeinsame Testnotiz'
        || workflowResult.rows[0]?.assigned_user_id !== staffRows[0].id
        || workflowResult.rows[0]?.sales_stage !== 'contacted'
        || workflowResult.rows[0]?.contact_id !== workflowContactId
        || workflowResult.rows[0]?.contact_channel !== 'email'
        || workflowResult.rows[0]?.priority !== 'high'
        || Number(workflowResult.rows[0]?.opportunity_value_eur) !== 25000
        || workflowResult.rows[0]?.opportunity_probability !== 35
        || !workflowResult.rows[0]?.first_contact_at
        || workflowResult.rows[0]?.events !== 1) {
      throw new Error('Die gemeinsame Account-Radar-Aufgabe wurde nicht korrekt gespeichert.');
    }
    const foreignContactResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/workflow`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'contact_planned',
        follow_up_at: followUpAt,
        contact_id: randomUUID(),
        contact_channel: 'email',
      }),
    });
    if (foreignContactResponse.status !== 400) {
      throw new Error('Der Account-Radar akzeptiert einen fremden oder unbekannten Ansprechpartner.');
    }
    const [restrictedSalesDocuments, permittedSalesDocuments] = await Promise.all([
      retrieveTenantInternalDocuments('Gemeinsame Testnotiz', staffRows[0].business_partner_id, 12, { includeSalesSources: false }),
      retrieveTenantInternalDocuments('Gemeinsame Testnotiz', staffRows[0].business_partner_id, 12, { includeSalesSources: true }),
    ]);
    if (restrictedSalesDocuments.some((document) => ['account_radar_task', 'tracked_account_news'].includes(document.type))) {
      throw new Error('Sales-Dokumente werden ohne explizite Sales-Berechtigung ausgeliefert.');
    }
    if (!permittedSalesDocuments.some((document) => document.type === 'account_radar_task')) {
      throw new Error('Berechtigte Sales-Nutzer erhalten keine Account-Radar-Aufgaben im KI-Kontext.');
    }
    const activityResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/activity`, { headers });
    const activityPayload = await activityResponse.json();
    if (!activityResponse.ok || !Array.isArray(activityPayload) || activityPayload[0]?.event_type !== 'created') {
      throw new Error(`Der Radar-Aktivitätsverlauf ist fehlerhaft (${activityResponse.status}).`);
    }
    if (activityPayload[0]?.event_data?.contact_name !== 'Erika Muster'
        || activityPayload[0]?.event_data?.contact_channel !== 'email') {
      throw new Error('Der Aktivitätsverlauf enthält den gewählten Ansprechpartner oder Kontaktkanal nicht.');
    }
    const irrelevantResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/relevance`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relevance_status: 'irrelevant', reason: 'false_positive', note: 'Testgrund' }),
    });
    const irrelevantPayload = await irrelevantResponse.json();
    if (!irrelevantResponse.ok || irrelevantPayload.status !== 'ignored' || irrelevantPayload.relevance_reason !== 'false_positive') {
      throw new Error(`Qualitätsfeedback wird nicht korrekt gespeichert (${irrelevantResponse.status}).`);
    }
    const relevantResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/relevance`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relevance_status: 'relevant' }),
    });
    if (!relevantResponse.ok || (await relevantResponse.json()).status !== 'read') {
      throw new Error('Ein ausgeblendeter Treffer kann nicht wieder als relevant markiert werden.');
    }
    const taskExportResponse = await fetch('http://127.0.0.1:5000/api/account-radar/exports/tasks.csv', { headers });
    const taskExport = await taskExportResponse.text();
    if (!taskExportResponse.ok
        || !taskExportResponse.headers.get('content-type')?.includes('text/csv')
        || !taskExport.includes(workflowArticleId)
        || !taskExport.includes('Erika Muster')) {
      throw new Error(`Mandantensicherer Aufgaben-Export ist fehlerhaft (${taskExportResponse.status}).`);
    }

    const taskImportHeaders = [
      'Signal-ID', 'Aufgabenstatus', 'Vertriebsphase', 'Priorität', 'Opportunity-Wert EUR', 'Abschlusswahrscheinlichkeit %', 'Aktion', 'Termin', 'Verantwortlich-ID',
      'Verantwortlich-E-Mail', 'Ansprechpartner-ID', 'Ansprechpartner', 'Kontaktkanal', 'Notiz',
    ];
    const validTaskRow = [
      workflowArticleId, 'Offen', 'Termin vereinbart', 'Hoch', '30000', '45', 'Kontakt geplant', followUpAt, staffRows[0].id,
      '', workflowContactId, 'Erika Muster', 'E-Mail', 'Importierte Ergebnisnotiz',
    ];
    const invalidTaskRow = [randomUUID(), 'Offen', '', 'Normal', '', '', 'Wiedervorlage', followUpAt, '', '', '', '', '', 'Fremdes Signal'];
    const taskForm = new FormData();
    taskForm.append('file', new Blob([
      `${taskImportHeaders.join(';')}\n${validTaskRow.join(';')}\n${invalidTaskRow.join(';')}\n`,
    ], { type: 'text/csv' }), 'account-radar-tasks-smoke.csv');
    const taskImportResponse = await fetch('http://127.0.0.1:5000/api/account-radar/tasks/import', {
      method: 'POST',
      headers,
      body: taskForm,
    });
    const taskImportPayload = await taskImportResponse.json();
    if (taskImportResponse.status !== 201
        || taskImportPayload.updated !== 1
        || taskImportPayload.invalid !== 1) {
      throw new Error(`Aufgaben-/Ergebnis-Import ist fehlerhaft (${taskImportResponse.status}).`);
    }
    const importedTaskResult = await db.query(`
      SELECT task.note, task.sales_stage, task.contact_id, task.contact_channel,
             task.priority, task.opportunity_value_eur, task.opportunity_probability,
             (SELECT COUNT(*)::integer FROM account_radar_task_events event WHERE event.task_id = task.id) AS events
      FROM account_radar_tasks task
      WHERE task.business_partner_id = $1 AND task.tracked_article_id = $2
    `, [staffRows[0].business_partner_id, workflowArticleId]);
    if (importedTaskResult.rows[0]?.note !== 'Importierte Ergebnisnotiz'
        || importedTaskResult.rows[0]?.sales_stage !== 'meeting'
        || importedTaskResult.rows[0]?.contact_id !== workflowContactId
        || importedTaskResult.rows[0]?.contact_channel !== 'email'
        || importedTaskResult.rows[0]?.priority !== 'high'
        || Number(importedTaskResult.rows[0]?.opportunity_value_eur) !== 30000
        || importedTaskResult.rows[0]?.opportunity_probability !== 45
        || importedTaskResult.rows[0]?.events !== 2) {
      throw new Error('Importierte Aufgabe bzw. das Ergebnis wurde nicht korrekt gespeichert.');
    }
    const wonResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/workflow`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'contact_planned',
        follow_up_at: followUpAt,
        note: 'Gemeinsame Testnotiz',
        assigned_user_id: staffRows[0].id,
        sales_stage: 'won',
        priority: 'high',
        opportunity_value_eur: 25000,
        opportunity_probability: 100,
      }),
    });
    const wonPayload = await wonResponse.json();
    if (!wonResponse.ok || wonPayload.sales_stage !== 'won' || wonPayload.task_status !== 'done' || wonPayload.status !== 'done') {
      throw new Error(`Die terminale Vertriebsphase schließt die Radar-Aufgabe nicht ab (${wonResponse.status}).`);
    }
    const analytics = await getAccountRadarAnalytics(staffRows[0].business_partner_id, 30);
    if (!analytics.metrics.signals || analytics.metrics.wins < 1 || analytics.metrics.wonRevenueEur < 25000) {
      throw new Error('Die mandantenspezifische Sales-Erfolgsmessung liefert keine belastbaren Abschlussdaten.');
    }
    const analyticsPdf = await createRadarManagementPdf({
      partner: { id: staffRows[0].business_partner_id, name: 'Smoke Mandant', color_scheme: { primary_color: '#e31b23' } },
      signals: [{
        account_name: 'Smoke Account', article_title: 'Sales-Signal', article_url: 'https://example.com/',
        source_name: 'Smoke', signal_type: 'Account-Signal', relevance_score: 90,
        sales_stage: 'won', recommended_action: 'Ergebnis dokumentieren.', published_at: new Date().toISOString(),
      }],
    });
    if (!Buffer.isBuffer(analyticsPdf) || analyticsPdf.length <= managementPdf.length) {
      throw new Error('Die Sales-Erfolgsmessung wurde nicht in die Management-PDF übernommen.');
    }
    const reopenResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/task-status`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_status: 'open' }),
    });
    const reopenPayload = await reopenResponse.json();
    if (!reopenResponse.ok || reopenPayload.task_status !== 'open' || reopenPayload.sales_stage !== null) {
      throw new Error(`Die gemeinsame Radar-Aufgabe kann nicht sauber wieder geöffnet werden (${reopenResponse.status}).`);
    }
    const completeResponse = await fetch(`http://127.0.0.1:5000/api/data/account-intelligence/articles/${workflowArticleId}/task-status`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_status: 'done' }),
    });
    const completePayload = await completeResponse.json();
    if (!completeResponse.ok || completePayload.task_status !== 'done' || completePayload.status !== 'done') {
      throw new Error(`Gemeinsame Radar-Aufgabe kann nicht erledigt werden (${completeResponse.status}).`);
    }
  } finally {
    await db.query('DELETE FROM account_intelligence_item_status WHERE tracked_article_id = $1', [workflowArticleId]);
    await db.query('DELETE FROM business_partner_tracked_articles WHERE id = $1', [workflowArticleId]);
    await db.query('DELETE FROM business_partner_accounts WHERE id = $1', [workflowAccountId]);
  }

  console.log(JSON.stringify({
    communityTrustVotes: votes.total,
    aggregateMismatches: 0,
    accountRadarDigestJobs: 1,
    schemaTables: 7,
    protectedApis: 10,
    accountRadarWorkflow: 'Kontakt + Kanal + Verantwortung + Priorität + Opportunity + Qualitätsgrund + Sales-Phase + Verlauf + Abschluss + Cleanup OK',
    managementPdf: `${managementPdf.length} Bytes, gültige PDF-Signatur`,
    trustVoteLifecycle: 'first vote + update OK',
    accountImportLifecycle: 'CSV import/export Accounts + Ansprechpartner + Cleanup OK',
    taskImportLifecycle: 'CSV import/export Aufgaben + Ergebnisse + Fremd-ID-Schutz OK',
    result: 'OK',
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
