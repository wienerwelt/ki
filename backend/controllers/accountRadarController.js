const db = require('../config/db');
const XLSX = require('xlsx');
const { logActivity } = require('../services/auditLogService');
const {
  buildRadarDigestPreview,
  sendAccountRadarTestEmail,
} = require('../services/accountRadarDigestService');
const { assertAccountCapacity, getBusinessPartnerSalesPlan } = require('../services/salesPlanService');
const { getAccountRadarAnalytics } = require('../services/accountRadarAnalyticsService');
const {
  buildCalendarFeedUrl,
  buildCalendarIcs,
  parseCalendarToken,
} = require('../services/accountRadarCalendarService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FREQUENCIES = new Set(['off', 'daily', 'weekdays', 'weekly']);
const ALLOWED_ACCOUNT_STATUSES = new Set(['prospect', 'active_customer', 'churned']);
const ALLOWED_TASK_STATUSES = new Set(['open', 'done']);
const ALLOWED_SALES_STAGES = new Set(['contacted', 'meeting', 'offer', 'won', 'lost']);
const ALLOWED_ACTION_TYPES = new Set(['contact_planned', 'follow_up']);
const ALLOWED_CONTACT_CHANNELS = new Set(['email', 'phone', 'linkedin', 'video_call', 'in_person', 'contact_form', 'other']);
const ALLOWED_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const ALLOWED_CAMPAIGN_STATUSES = new Set(['draft', 'active', 'completed', 'archived']);
const ALLOWED_CAMPAIGN_DETAIL_PERIODS = new Set([7, 30, 90, 365]);

const normalizeHeader = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const stripSpreadsheetGuard = (value) => {
  const text = String(value ?? '');
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
};

const readField = (row, aliases) => {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const entry = Object.entries(row).find(([key]) => normalizedAliases.has(normalizeHeader(key)));
  return entry ? stripSpreadsheetGuard(entry[1]) : '';
};

const normalizeText = (value, maxLength = 500) => normalizeName(value)
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength) || null;

const normalizeEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return null;
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('E-Mail-Adresse ist ungültig.');
  }
  return email;
};

const normalizeUrl = (value, label) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch (_) {
    throw new Error(`${label} ist keine gültige URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`${label} muss eine öffentliche HTTP-/HTTPS-Adresse sein.`);
  }
  return parsed.toString().slice(0, 2000);
};

const normalizeAssetUrl = (value, label) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    if (raw.length > 2000 || /[\\\u0000-\u001f\u007f]/.test(raw) || raw.split('/').includes('..')) {
      throw new Error(`${label} ist kein gültiger lokaler Pfad.`);
    }
    return raw;
  }
  return normalizeUrl(raw, label);
};

const normalizeStatus = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return 'prospect';
  const aliases = {
    prospect: 'prospect', interessent: 'prospect', lead: 'prospect', potenziell: 'prospect',
    activecustomer: 'active_customer', kunde: 'active_customer', aktivkunde: 'active_customer', customer: 'active_customer',
    churned: 'churned', ehemalig: 'churned', exkunde: 'churned', verloren: 'churned',
  };
  const status = aliases[raw] || String(value || '').trim();
  if (!ALLOWED_ACCOUNT_STATUSES.has(status)) {
    throw new Error('Status muss Interessent, Kunde oder Ehemalig sein.');
  }
  return status;
};

const normalizeBoolean = (value, fallback = true) => {
  if (value === '' || value === null || value === undefined) return fallback;
  return !['0', 'false', 'nein', 'no', 'inaktiv'].includes(normalizeHeader(value));
};

const normalizeTaskStatus = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return 'open';
  const status = ({ open: 'open', offen: 'open', done: 'done', erledigt: 'done', abgeschlossen: 'done' })[raw] || raw;
  if (!ALLOWED_TASK_STATUSES.has(status)) throw new Error('Aufgabenstatus muss Offen oder Erledigt sein.');
  return status;
};

const normalizeSalesStage = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return null;
  const stage = ({
    contacted: 'contacted', kontaktiert: 'contacted',
    meeting: 'meeting', termin: 'meeting', terminvereinbart: 'meeting',
    offer: 'offer', angebot: 'offer',
    won: 'won', gewonnen: 'won',
    lost: 'lost', verloren: 'lost',
  })[raw] || raw;
  if (!ALLOWED_SALES_STAGES.has(stage)) throw new Error('Vertriebsphase ist ungültig.');
  return stage;
};

const normalizeActionType = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return null;
  const actionType = ({
    contactplanned: 'contact_planned', kontaktgeplant: 'contact_planned', kontaktplanen: 'contact_planned',
    followup: 'follow_up', wiedervorlage: 'follow_up',
  })[raw] || String(value || '').trim();
  if (!ALLOWED_ACTION_TYPES.has(actionType)) throw new Error('Aktion muss Kontakt geplant oder Wiedervorlage sein.');
  return actionType;
};

const normalizeContactChannel = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return null;
  const channel = ({
    email: 'email',
    phone: 'phone', telefon: 'phone',
    linkedin: 'linkedin',
    videocall: 'video_call', video: 'video_call',
    inperson: 'in_person', personlich: 'in_person', persoenlich: 'in_person',
    contactform: 'contact_form', kontaktformular: 'contact_form',
    other: 'other', sonstigerkanal: 'other', sonstiges: 'other',
  })[raw] || String(value || '').trim();
  if (!ALLOWED_CONTACT_CHANNELS.has(channel)) throw new Error('Kontaktkanal ist ungültig.');
  return channel;
};

const normalizePriority = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return 'normal';
  const priority = ({ niedrig: 'low', normal: 'normal', hoch: 'high', dringend: 'urgent' })[raw] || raw;
  if (!ALLOWED_PRIORITIES.has(priority)) throw new Error('Priorität muss Niedrig, Normal, Hoch oder Dringend sein.');
  return priority;
};

const normalizeOptionalNumber = (value, label, min, max, integer = false) => {
  const raw = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`${label} muss zwischen ${min} und ${max} liegen.`);
  }
  return number;
};

const normalizeImportDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const germanDate = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  const date = germanDate
    ? new Date(
      Number(germanDate[3]),
      Number(germanDate[2]) - 1,
      Number(germanDate[1]),
      Number(germanDate[4] || 9),
      Number(germanDate[5] || 0)
    )
    : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error('Termin ist kein gültiges Datum.');
  const earliest = new Date();
  earliest.setFullYear(earliest.getFullYear() - 3);
  const latest = new Date();
  latest.setFullYear(latest.getFullYear() + 3);
  if (date < earliest || date > latest) throw new Error('Termin liegt außerhalb des zulässigen Zeitraums.');
  return date.toISOString();
};

const spreadsheetSafeText = (value) => {
  const text = String(value ?? '').replace(/\r\n?/g, '\n');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const escapeCsvCell = (value) => `"${spreadsheetSafeText(value).replace(/"/g, '""')}"`;

const sendCsv = (res, filename, headers, rows) => {
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}\r\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(csv);
};

const readImportRows = (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: false });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
};

const getTenantId = (req, res) => {
  const tenantId = req.user?.business_partner_id;
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    res.status(400).json({ message: 'Für den Benutzer ist kein gültiger Mandant hinterlegt.' });
    return null;
  }
  return tenantId;
};

exports.getEntitlements = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  try {
    const entitlements = await getBusinessPartnerSalesPlan(db, businessPartnerId);
    if (String(req.user?.role || '').toLowerCase() !== 'admin' && entitlements.subscription) {
      delete entitlements.subscription.monthlyPriceEur;
      delete entitlements.subscription.billingCycle;
    }
    res.json(entitlements);
  } catch (error) {
    console.error('[AccountRadar] Paketinformationen konnten nicht geladen werden:', error.message);
    res.status(error.statusCode || 500).json({ message: 'Sales-Paket konnte nicht geladen werden.' });
  }
};

exports.getAnalytics = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  try {
    const requestedPeriod = Number.parseInt(String(req.query.periodDays || ''), 10);
    return res.json(await getAccountRadarAnalytics(businessPartnerId, requestedPeriod));
  } catch (error) {
    console.error('[AccountRadar] Erfolgsanalyse konnte nicht geladen werden:', error.message);
    return res.status(500).json({ message: 'Die Sales-Erfolgsmessung konnte nicht geladen werden.' });
  }
};

const campaignValidationError = (message) => Object.assign(new Error(message), { statusCode: 400 });

const normalizeCampaignTarget = (value, label, { integer = true, maximum = 1000000 } = {}) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum || (integer && !Number.isInteger(number))) {
    throw campaignValidationError(`${label} ist ungültig.`);
  }
  return number;
};

const normalizeCampaignPayload = (body = {}) => {
  const name = normalizeText(body.name, 120);
  const objective = normalizeText(body.objective, 1000);
  const status = String(body.status || 'draft').trim().toLowerCase();
  const startsOn = body.starts_on ? String(body.starts_on).slice(0, 10) : null;
  const endsOn = body.ends_on ? String(body.ends_on).slice(0, 10) : null;
  const ownerUserId = body.owner_user_id ? String(body.owner_user_id) : null;
  if (!name || name.length < 2) throw campaignValidationError('Der Kampagnenname muss mindestens zwei Zeichen enthalten.');
  if (!ALLOWED_CAMPAIGN_STATUSES.has(status)) throw campaignValidationError('Der Kampagnenstatus ist ungültig.');
  if (startsOn && !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) throw campaignValidationError('Der Kampagnenstart ist ungültig.');
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) throw campaignValidationError('Das Kampagnenende ist ungültig.');
  if (startsOn && endsOn && startsOn > endsOn) throw campaignValidationError('Das Kampagnenende muss nach dem Start liegen.');
  if (ownerUserId && !UUID_PATTERN.test(ownerUserId)) throw campaignValidationError('Die Kampagnenverantwortung ist ungültig.');
  return {
    name,
    objective,
    status,
    startsOn,
    endsOn,
    ownerUserId,
    targetAccounts: normalizeCampaignTarget(body.target_accounts, 'Das Account-Ziel'),
    targetContacts: normalizeCampaignTarget(body.target_contacts, 'Das Kontakt-Ziel'),
    targetMeetings: normalizeCampaignTarget(body.target_meetings, 'Das Termin-Ziel'),
    targetOffers: normalizeCampaignTarget(body.target_offers, 'Das Angebots-Ziel'),
    targetWins: normalizeCampaignTarget(body.target_wins, 'Das Abschluss-Ziel'),
    targetPipelineEur: normalizeCampaignTarget(body.target_pipeline_eur, 'Das Pipeline-Ziel', { integer: false, maximum: 1000000000000 }),
  };
};

const verifyCampaignOwner = async (businessPartnerId, ownerUserId) => {
  if (!ownerUserId) return;
  const result = await db.query(
    `SELECT 1 FROM users
     WHERE id = $1 AND business_partner_id = $2 AND is_active = TRUE
       AND LOWER(role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user')`,
    [ownerUserId, businessPartnerId]
  );
  if (!result.rows[0]) throw campaignValidationError('Die Kampagnenverantwortung gehört nicht zum berechtigten Team dieses Mandanten.');
};

exports.listCampaigns = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  try {
    const result = await db.query(
      `SELECT
         campaign.id::text,
         campaign.name,
         campaign.objective,
         campaign.status,
         campaign.starts_on,
         campaign.ends_on,
         campaign.owner_user_id::text,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', owner.first_name, owner.last_name)), ''), owner.username) AS owner_user_name,
         owner.email AS owner_user_email,
         owner.profile_image_url AS owner_profile_image_url,
         campaign.target_accounts,
         campaign.target_contacts,
         campaign.target_meetings,
         campaign.target_offers,
         campaign.target_wins,
         campaign.target_pipeline_eur,
         campaign.updated_at,
         COALESCE((SELECT json_agg(link.account_id::text ORDER BY link.account_id::text)
                   FROM account_radar_campaign_accounts link WHERE link.campaign_id = campaign.id), '[]'::json) AS account_ids,
         COALESCE((SELECT json_agg(link.tracked_article_id::text ORDER BY link.tracked_article_id::text)
                   FROM account_radar_campaign_signals link WHERE link.campaign_id = campaign.id), '[]'::json) AS signal_ids,
         (SELECT COUNT(*)::int FROM account_radar_campaign_accounts link WHERE link.campaign_id = campaign.id) AS account_count,
         COALESCE(metrics.signal_count, 0)::int AS signal_count,
         COALESCE(metrics.open_task_count, 0)::int AS open_task_count,
         COALESCE(metrics.planned_count, 0)::int AS planned_count,
         COALESCE(metrics.overdue_count, 0)::int AS overdue_count,
         COALESCE(metrics.done_count, 0)::int AS done_count,
         COALESCE(metrics.contacted_count, 0)::int AS contacted_count,
         COALESCE(metrics.meeting_count, 0)::int AS meeting_count,
         COALESCE(metrics.offer_count, 0)::int AS offer_count,
         COALESCE(metrics.won_count, 0)::int AS won_count,
         COALESCE(metrics.open_pipeline_value_eur, 0)::numeric AS open_pipeline_value_eur,
         COALESCE(metrics.weighted_pipeline_value_eur, 0)::numeric AS weighted_pipeline_value_eur
       FROM account_radar_campaigns campaign
       LEFT JOIN users owner ON owner.id = campaign.owner_user_id
       LEFT JOIN LATERAL (
         WITH scoped_signals AS (
           SELECT direct_signal.tracked_article_id
           FROM account_radar_campaign_signals direct_signal
           WHERE direct_signal.campaign_id = campaign.id
           UNION
           SELECT tracked.id
           FROM account_radar_campaign_accounts assigned_account
           JOIN business_partner_tracked_articles tracked ON tracked.account_id = assigned_account.account_id
           WHERE assigned_account.campaign_id = campaign.id
         )
         SELECT
           COUNT(scoped.tracked_article_id)::int AS signal_count,
           COUNT(task.id) FILTER (WHERE task.task_status = 'open')::int AS open_task_count,
           COUNT(task.id) FILTER (WHERE task.task_status = 'open' AND task.follow_up_at >= CURRENT_TIMESTAMP)::int AS planned_count,
           COUNT(task.id) FILTER (WHERE task.task_status = 'open' AND task.follow_up_at < CURRENT_TIMESTAMP)::int AS overdue_count,
           COUNT(task.id) FILTER (WHERE task.task_status = 'done')::int AS done_count,
           COUNT(task.id) FILTER (WHERE task.first_contact_at IS NOT NULL OR task.sales_stage IS NOT NULL)::int AS contacted_count,
           COUNT(task.id) FILTER (WHERE task.sales_stage IN ('meeting', 'offer', 'won'))::int AS meeting_count,
           COUNT(task.id) FILTER (WHERE task.sales_stage IN ('offer', 'won'))::int AS offer_count,
           COUNT(task.id) FILTER (WHERE task.sales_stage = 'won')::int AS won_count,
           COALESCE(SUM(task.opportunity_value_eur) FILTER (
             WHERE task.task_status <> 'cancelled' AND task.sales_stage IN ('contacted', 'meeting', 'offer')
           ), 0) AS open_pipeline_value_eur,
           COALESCE(SUM(task.opportunity_value_eur * COALESCE(task.opportunity_probability, 0) / 100.0) FILTER (
             WHERE task.task_status <> 'cancelled' AND task.sales_stage IN ('contacted', 'meeting', 'offer')
           ), 0) AS weighted_pipeline_value_eur
         FROM scoped_signals scoped
         LEFT JOIN account_radar_tasks task
           ON task.tracked_article_id = scoped.tracked_article_id
          AND task.business_partner_id = $1
       ) metrics ON TRUE
       WHERE campaign.business_partner_id = $1
         AND ($2::boolean = TRUE OR campaign.status <> 'archived')
       ORDER BY
         CASE campaign.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
         campaign.starts_on DESC NULLS LAST,
         campaign.name`,
      [businessPartnerId, String(req.query.include_archived || '') === 'true']
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('[AccountRadar] Kampagnen konnten nicht geladen werden:', error.message);
    return res.status(500).json({ message: 'Kampagnen konnten nicht geladen werden.' });
  }
};

const campaignTimelineBucket = (value, periodDays) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  if (periodDays >= 365) return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  if (periodDays >= 90) {
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - weekday + 1);
  }
  return date.toISOString().slice(0, 10);
};

exports.getCampaignDetail = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  const campaignId = String(req.params.campaignId || '');
  if (!UUID_PATTERN.test(campaignId)) return res.status(400).json({ message: 'Ungültige Kampagnen-ID.' });
  const requestedPeriod = Number.parseInt(String(req.query.periodDays || ''), 10);
  const periodDays = ALLOWED_CAMPAIGN_DETAIL_PERIODS.has(requestedPeriod) ? requestedPeriod : 30;
  const cutoff = new Date(Date.now() - periodDays * 86_400_000);

  try {
    const campaignResult = await db.query(
      `SELECT campaign.id::text, campaign.name, campaign.objective, campaign.status,
              campaign.starts_on, campaign.ends_on, campaign.owner_user_id::text,
              campaign.target_accounts, campaign.target_contacts, campaign.target_meetings,
              campaign.target_offers, campaign.target_wins, campaign.target_pipeline_eur,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', owner.first_name, owner.last_name)), ''), owner.username) AS owner_user_name,
              owner.email AS owner_user_email, owner.profile_image_url AS owner_profile_image_url
       FROM account_radar_campaigns campaign
       LEFT JOIN users owner ON owner.id = campaign.owner_user_id
       WHERE campaign.id = $1 AND campaign.business_partner_id = $2`,
      [campaignId, businessPartnerId]
    );
    if (!campaignResult.rows[0]) return res.status(404).json({ message: 'Kampagne nicht gefunden.' });

    const scopedSignalsSql = `
      WITH scoped_signals AS (
        SELECT direct_signal.tracked_article_id
        FROM account_radar_campaign_signals direct_signal
        WHERE direct_signal.campaign_id = $1
        UNION
        SELECT tracked.id
        FROM account_radar_campaign_accounts assigned_account
        JOIN business_partner_tracked_articles tracked ON tracked.account_id = assigned_account.account_id
        WHERE assigned_account.campaign_id = $1
      )`;

    const [signalResult, stageEventResult, accountResult] = await Promise.all([
      db.query(`${scopedSignalsSql}
        SELECT article.id::text,
               article.account_id::text,
               COALESCE(article.published_at, article.created_at) AS signal_at,
               task.id::text AS task_id,
               task.task_status,
               task.follow_up_at,
               task.completed_at,
               task.first_contact_at,
               task.sales_stage,
               task.sales_stage_updated_at,
               task.opportunity_value_eur,
               task.opportunity_probability
        FROM scoped_signals scoped
        JOIN business_partner_tracked_articles article ON article.id = scoped.tracked_article_id
        JOIN business_partner_accounts account
          ON account.id = article.account_id AND account.business_partner_id = $2
        LEFT JOIN account_radar_tasks task
          ON task.tracked_article_id = article.id
         AND task.business_partner_id = $2
         AND task.task_status <> 'cancelled'
        LIMIT 50000`, [campaignId, businessPartnerId]),
      db.query(`${scopedSignalsSql}
        SELECT event.task_id::text, event.created_at, event.event_data->>'sales_stage' AS sales_stage
        FROM scoped_signals scoped
        JOIN account_radar_tasks task
          ON task.tracked_article_id = scoped.tracked_article_id
         AND task.business_partner_id = $2
        JOIN account_radar_task_events event
          ON event.task_id = task.id AND event.business_partner_id = $2
        WHERE event.created_at >= $3
          AND event.event_data->>'sales_stage' IN ('contacted', 'meeting', 'offer', 'won', 'lost')`,
      [campaignId, businessPartnerId, cutoff.toISOString()]),
      db.query(`
        WITH scoped_signals AS (
          SELECT direct_signal.tracked_article_id, direct_article.account_id
          FROM account_radar_campaign_signals direct_signal
          JOIN business_partner_tracked_articles direct_article ON direct_article.id = direct_signal.tracked_article_id
          WHERE direct_signal.campaign_id = $1
          UNION
          SELECT tracked.id, tracked.account_id
          FROM account_radar_campaign_accounts assigned_account
          JOIN business_partner_tracked_articles tracked ON tracked.account_id = assigned_account.account_id
          WHERE assigned_account.campaign_id = $1
        ), scoped_accounts AS (
          SELECT assigned.account_id
          FROM account_radar_campaign_accounts assigned
          WHERE assigned.campaign_id = $1
          UNION
          SELECT scoped_signal.account_id
          FROM scoped_signals scoped_signal
        )
        SELECT account.id::text, account.name, account.logo_url,
               COUNT(article.id)::int AS signal_count,
               COUNT(task.id) FILTER (WHERE task.task_status = 'open')::int AS open_task_count,
               COUNT(task.id) FILTER (WHERE task.sales_stage = 'won')::int AS won_count
        FROM scoped_accounts scoped
        JOIN business_partner_accounts account
          ON account.id = scoped.account_id AND account.business_partner_id = $2
        LEFT JOIN scoped_signals scoped_signal ON scoped_signal.account_id = account.id
        LEFT JOIN business_partner_tracked_articles article
          ON article.id = scoped_signal.tracked_article_id AND article.account_id = account.id
        LEFT JOIN account_radar_tasks task
          ON task.tracked_article_id = article.id AND task.business_partner_id = $2 AND task.task_status <> 'cancelled'
        GROUP BY account.id, account.name, account.logo_url
        ORDER BY COUNT(task.id) FILTER (WHERE task.task_status = 'open') DESC, account.name
        LIMIT 200`, [campaignId, businessPartnerId]),
    ]);

    const signals = signalResult.rows;
    const stageSets = { contacted: new Set(), meeting: new Set(), offer: new Set(), won: new Set(), lost: new Set() };
    const timeline = new Map();
    const ensureTimeline = (value) => {
      const key = campaignTimelineBucket(value, periodDays);
      if (!key) return null;
      const current = timeline.get(key) || { date: key, signals: 0, contacts: 0, meetings: 0, offers: 0, wins: 0 };
      timeline.set(key, current);
      return current;
    };
    const inPeriod = (value) => {
      const timestamp = value ? new Date(value).getTime() : Number.NaN;
      return Number.isFinite(timestamp) && timestamp >= cutoff.getTime();
    };

    signals.forEach((signal) => {
      if (inPeriod(signal.signal_at)) {
        const bucket = ensureTimeline(signal.signal_at);
        if (bucket) bucket.signals += 1;
      }
      if (inPeriod(signal.first_contact_at)) {
        stageSets.contacted.add(signal.task_id);
        const bucket = ensureTimeline(signal.first_contact_at);
        if (bucket) bucket.contacts += 1;
      }
    });

    const recordedStageKeys = new Set();
    const addStageEvent = (taskId, stage, createdAt) => {
      if (!taskId || !stageSets[stage]) return;
      const eventKey = `${taskId}:${stage}`;
      if (recordedStageKeys.has(eventKey)) return;
      recordedStageKeys.add(eventKey);
      stageSets[stage].add(taskId);
      const bucket = ensureTimeline(createdAt);
      if (!bucket) return;
      if (stage === 'meeting') bucket.meetings += 1;
      if (stage === 'offer') bucket.offers += 1;
      if (stage === 'won') bucket.wins += 1;
    };
    stageEventResult.rows.forEach((event) => addStageEvent(event.task_id, event.sales_stage, event.created_at));
    signals.forEach((signal) => {
      if (signal.sales_stage && inPeriod(signal.sales_stage_updated_at)) {
        addStageEvent(signal.task_id, signal.sales_stage, signal.sales_stage_updated_at);
      }
    });

    const openPipelineValueEur = signals.reduce((sum, signal) => (
      signal.task_status !== 'cancelled' && ['contacted', 'meeting', 'offer'].includes(signal.sales_stage)
        ? sum + Number(signal.opportunity_value_eur || 0) : sum
    ), 0);
    const weightedPipelineValueEur = signals.reduce((sum, signal) => (
      signal.task_status !== 'cancelled' && ['contacted', 'meeting', 'offer'].includes(signal.sales_stage)
        ? sum + Number(signal.opportunity_value_eur || 0) * Number(signal.opportunity_probability || 0) / 100 : sum
    ), 0);

    return res.json({
      campaign: campaignResult.rows[0],
      periodDays,
      generatedAt: new Date().toISOString(),
      isSampled: signals.length >= 50000,
      metrics: {
        accounts: accountResult.rows.length,
        signals: signals.filter((signal) => inPeriod(signal.signal_at)).length,
        contacts: stageSets.contacted.size,
        meetings: stageSets.meeting.size,
        offers: stageSets.offer.size,
        wins: stageSets.won.size,
        losses: stageSets.lost.size,
        openPipelineValueEur: Math.round(openPipelineValueEur * 100) / 100,
        weightedPipelineValueEur: Math.round(weightedPipelineValueEur * 100) / 100,
      },
      timeline: Array.from(timeline.values()).sort((left, right) => left.date.localeCompare(right.date)),
      accounts: accountResult.rows,
    });
  } catch (error) {
    console.error('[AccountRadar] Kampagnendetails konnten nicht geladen werden:', error.message);
    return res.status(500).json({ message: 'Kampagnendetails konnten nicht geladen werden.' });
  }
};

exports.createCampaign = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  try {
    const payload = normalizeCampaignPayload(req.body);
    await verifyCampaignOwner(businessPartnerId, payload.ownerUserId);
    const result = await db.query(
      `INSERT INTO account_radar_campaigns
         (business_partner_id, name, objective, status, starts_on, ends_on, owner_user_id,
          target_accounts, target_contacts, target_meetings, target_offers, target_wins, target_pipeline_eur,
          created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
       RETURNING id::text, name, objective, status, starts_on, ends_on, owner_user_id::text,
                 target_accounts, target_contacts, target_meetings, target_offers, target_wins, target_pipeline_eur, updated_at`,
      [
        businessPartnerId, payload.name, payload.objective, payload.status, payload.startsOn, payload.endsOn,
        payload.ownerUserId, payload.targetAccounts, payload.targetContacts, payload.targetMeetings,
        payload.targetOffers, payload.targetWins, payload.targetPipelineEur, req.user.id,
      ]
    );
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_CAMPAIGN_CREATED',
      status: 'success',
      targetId: result.rows[0].id,
      targetType: 'account_radar_campaign',
      details: { businessPartnerId, name: result.rows[0].name },
    });
    return res.status(201).json({
      ...result.rows[0],
      account_ids: [], signal_ids: [], account_count: 0, signal_count: 0,
      open_task_count: 0, planned_count: 0, overdue_count: 0, done_count: 0,
      contacted_count: 0, meeting_count: 0, offer_count: 0, won_count: 0,
      open_pipeline_value_eur: 0, weighted_pipeline_value_eur: 0,
    });
  } catch (error) {
    const duplicate = error.code === '23505';
    const statusCode = duplicate ? 409 : (error.statusCode || 500);
    console.error('[AccountRadar] Kampagne konnte nicht angelegt werden:', error.message);
    return res.status(statusCode).json({
      message: duplicate
        ? 'Eine aktive Kampagne mit diesem Namen besteht bereits.'
        : statusCode === 400 ? error.message : 'Kampagne konnte nicht angelegt werden.',
    });
  }
};

exports.updateCampaign = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  const campaignId = String(req.params.campaignId || '');
  if (!UUID_PATTERN.test(campaignId)) return res.status(400).json({ message: 'Ungültige Kampagnen-ID.' });
  try {
    const payload = normalizeCampaignPayload(req.body);
    await verifyCampaignOwner(businessPartnerId, payload.ownerUserId);
    const result = await db.query(
       `UPDATE account_radar_campaigns
       SET name = $3, objective = $4, status = $5, starts_on = $6, ends_on = $7,
           owner_user_id = $8, target_accounts = $9, target_contacts = $10,
           target_meetings = $11, target_offers = $12, target_wins = $13,
           target_pipeline_eur = $14, updated_by_user_id = $15, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND business_partner_id = $2
       RETURNING id::text, name, objective, status, starts_on, ends_on, owner_user_id::text,
                 target_accounts, target_contacts, target_meetings, target_offers, target_wins, target_pipeline_eur, updated_at`,
      [
        campaignId, businessPartnerId, payload.name, payload.objective, payload.status,
        payload.startsOn, payload.endsOn, payload.ownerUserId, payload.targetAccounts,
        payload.targetContacts, payload.targetMeetings, payload.targetOffers, payload.targetWins,
        payload.targetPipelineEur, req.user.id,
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Kampagne nicht gefunden.' });
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_CAMPAIGN_UPDATED',
      status: 'success',
      targetId: result.rows[0].id,
      targetType: 'account_radar_campaign',
      details: { businessPartnerId, name: result.rows[0].name, campaignStatus: result.rows[0].status },
    });
    return res.json(result.rows[0]);
  } catch (error) {
    const duplicate = error.code === '23505';
    const statusCode = duplicate ? 409 : (error.statusCode || 500);
    console.error('[AccountRadar] Kampagne konnte nicht gespeichert werden:', error.message);
    return res.status(statusCode).json({
      message: duplicate
        ? 'Eine aktive Kampagne mit diesem Namen besteht bereits.'
        : statusCode === 400 ? error.message : 'Kampagne konnte nicht gespeichert werden.',
    });
  }
};

const normalizeUuidList = (value, maximum, label) => {
  if (!Array.isArray(value)) throw campaignValidationError(`${label} müssen als Liste übergeben werden.`);
  const values = Array.from(new Set(value.map((item) => String(item || '')).filter(Boolean)));
  if (values.length > maximum || values.some((item) => !UUID_PATTERN.test(item))) {
    throw campaignValidationError(`${label} enthalten ungültige oder zu viele Einträge.`);
  }
  return values;
};

exports.replaceCampaignAssignments = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  const campaignId = String(req.params.campaignId || '');
  if (!UUID_PATTERN.test(campaignId)) return res.status(400).json({ message: 'Ungültige Kampagnen-ID.' });
  let accountIds;
  let signalIds;
  try {
    accountIds = normalizeUuidList(req.body?.account_ids || [], 5000, 'Accounts');
    signalIds = normalizeUuidList(req.body?.signal_ids || [], 10000, 'Signale');
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const campaign = await client.query(
      `SELECT id FROM account_radar_campaigns WHERE id = $1 AND business_partner_id = $2 AND status <> 'archived' FOR UPDATE`,
      [campaignId, businessPartnerId]
    );
    if (!campaign.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Kampagne nicht gefunden oder archiviert.' });
    }
    if (accountIds.length) {
      const accountCheck = await client.query(
        `SELECT COUNT(*)::int AS count FROM business_partner_accounts WHERE business_partner_id = $1 AND id = ANY($2::uuid[])`,
        [businessPartnerId, accountIds]
      );
      if (Number(accountCheck.rows[0]?.count || 0) !== accountIds.length) throw campaignValidationError('Mindestens ein Account gehört nicht zu diesem Mandanten.');
    }
    if (signalIds.length) {
      const signalCheck = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM business_partner_tracked_articles article
         JOIN business_partner_accounts account ON account.id = article.account_id
         WHERE account.business_partner_id = $1 AND article.id = ANY($2::uuid[])`,
        [businessPartnerId, signalIds]
      );
      if (Number(signalCheck.rows[0]?.count || 0) !== signalIds.length) throw campaignValidationError('Mindestens ein Signal gehört nicht zu diesem Mandanten.');
    }
    await client.query('DELETE FROM account_radar_campaign_accounts WHERE campaign_id = $1', [campaignId]);
    await client.query('DELETE FROM account_radar_campaign_signals WHERE campaign_id = $1', [campaignId]);
    if (accountIds.length) {
      await client.query(
        `INSERT INTO account_radar_campaign_accounts (campaign_id, account_id)
         SELECT $1, value FROM unnest($2::uuid[]) AS value`,
        [campaignId, accountIds]
      );
    }
    if (signalIds.length) {
      await client.query(
        `INSERT INTO account_radar_campaign_signals (campaign_id, tracked_article_id)
         SELECT $1, value FROM unnest($2::uuid[]) AS value`,
        [campaignId, signalIds]
      );
    }
    await client.query(
      `UPDATE account_radar_campaigns SET updated_by_user_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [campaignId, req.user.id]
    );
    await client.query('COMMIT');
    return res.json({ campaign_id: campaignId, account_ids: accountIds, signal_ids: signalIds });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[AccountRadar] Kampagnenzuordnung konnte nicht gespeichert werden:', error.message);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode === 400 ? error.message : 'Kampagnenzuordnung konnte nicht gespeichert werden.',
    });
  } finally {
    client.release();
  }
};

exports.replaceSignalCampaigns = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  const signalId = String(req.params.signalId || '');
  if (!UUID_PATTERN.test(signalId)) return res.status(400).json({ message: 'Ungültige Signal-ID.' });
  let campaignIds;
  try {
    campaignIds = normalizeUuidList(req.body?.campaign_ids || [], 50, 'Kampagnen');
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const signalCheck = await client.query(
      `SELECT article.id
       FROM business_partner_tracked_articles article
       JOIN business_partner_accounts account ON account.id = article.account_id
       WHERE article.id = $1 AND account.business_partner_id = $2
       LIMIT 1`,
      [signalId, businessPartnerId]
    );
    if (!signalCheck.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Signal nicht gefunden.' });
    }
    if (campaignIds.length) {
      const campaignCheck = await client.query(
        `SELECT COUNT(*)::int AS count FROM account_radar_campaigns
         WHERE business_partner_id = $1 AND status <> 'archived' AND id = ANY($2::uuid[])`,
        [businessPartnerId, campaignIds]
      );
      if (Number(campaignCheck.rows[0]?.count || 0) !== campaignIds.length) throw campaignValidationError('Mindestens eine Kampagne ist ungültig oder gehört nicht zu diesem Mandanten.');
    }
    await client.query(
      `DELETE FROM account_radar_campaign_signals link
       USING account_radar_campaigns campaign
       WHERE link.campaign_id = campaign.id
         AND link.tracked_article_id = $1
         AND campaign.business_partner_id = $2`,
      [signalId, businessPartnerId]
    );
    if (campaignIds.length) {
      await client.query(
        `INSERT INTO account_radar_campaign_signals (campaign_id, tracked_article_id)
         SELECT value, $2 FROM unnest($1::uuid[]) AS value`,
        [campaignIds, signalId]
      );
    }
    await client.query('COMMIT');
    return res.json({ signal_id: signalId, campaign_ids: campaignIds });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[AccountRadar] Signal-Kampagnen konnten nicht gespeichert werden:', error.message);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode === 400 ? error.message : 'Signal-Kampagnen konnten nicht gespeichert werden.',
    });
  } finally {
    client.release();
  }
};

exports.getCalendarFeed = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  try {
    const result = await db.query(
      `SELECT token_version::text, is_active, updated_at
       FROM account_radar_calendar_feeds WHERE business_partner_id = $1`,
      [businessPartnerId]
    );
    const feed = result.rows[0] || null;
    return res.json({
      enabled: Boolean(feed?.is_active),
      url: feed?.is_active ? buildCalendarFeedUrl(businessPartnerId, feed.token_version) : null,
      updated_at: feed?.updated_at || null,
    });
  } catch (error) {
    console.error('[AccountRadar] Kalenderfeed konnte nicht geladen werden:', error.message);
    return res.status(500).json({ message: 'Kalenderfeed konnte nicht geladen werden.' });
  }
};

exports.rotateCalendarFeed = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  try {
    const result = await db.query(
      `INSERT INTO account_radar_calendar_feeds
         (business_partner_id, token_version, is_active, created_by_user_id, updated_by_user_id)
       VALUES ($1, gen_random_uuid(), TRUE, $2, $2)
       ON CONFLICT (business_partner_id) DO UPDATE
       SET token_version = gen_random_uuid(), is_active = TRUE, updated_by_user_id = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING token_version::text, updated_at`,
      [businessPartnerId, req.user.id]
    );
    return res.json({
      enabled: true,
      url: buildCalendarFeedUrl(businessPartnerId, result.rows[0].token_version),
      updated_at: result.rows[0].updated_at,
    });
  } catch (error) {
    console.error('[AccountRadar] Kalenderfeed konnte nicht erstellt werden:', error.message);
    return res.status(500).json({ message: 'Kalenderfeed konnte nicht erstellt werden.' });
  }
};

exports.disableCalendarFeed = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  try {
    await db.query(
      `UPDATE account_radar_calendar_feeds SET is_active = FALSE, updated_by_user_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE business_partner_id = $1`,
      [businessPartnerId, req.user.id]
    );
    return res.json({ enabled: false, url: null });
  } catch (error) {
    console.error('[AccountRadar] Kalenderfeed konnte nicht deaktiviert werden:', error.message);
    return res.status(500).json({ message: 'Kalenderfeed konnte nicht deaktiviert werden.' });
  }
};

exports.getPublicCalendarFeed = async (req, res) => {
  try {
    const parsed = parseCalendarToken(req.params.token);
    if (!parsed) return res.status(404).type('text/plain').send('Kalenderfeed nicht gefunden.');
    const feedResult = await db.query(
      `SELECT feed.business_partner_id, partner.name
       FROM account_radar_calendar_feeds feed
       JOIN business_partners partner ON partner.id = feed.business_partner_id
       WHERE feed.business_partner_id = $1 AND feed.token_version = $2 AND feed.is_active = TRUE
       LIMIT 1`,
      [parsed.businessPartnerId, parsed.version]
    );
    if (!feedResult.rows[0]) return res.status(404).type('text/plain').send('Kalenderfeed nicht gefunden.');
    const entriesResult = await db.query(
      `SELECT task.id::text, task.action_type, task.follow_up_at, task.completed_at,
              task.task_status, task.contact_channel, task.sales_stage,
              account.name AS account_name,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', assignee.first_name, assignee.last_name)), ''), assignee.username) AS assigned_user_name
       FROM account_radar_tasks task
       JOIN business_partner_tracked_articles article ON article.id = task.tracked_article_id
       JOIN business_partner_accounts account ON account.id = article.account_id
       LEFT JOIN users assignee ON assignee.id = task.assigned_user_id
       WHERE task.business_partner_id = $1
         AND task.task_status <> 'cancelled'
         AND task.action_type IS NOT NULL
         AND task.follow_up_at IS NOT NULL
         AND COALESCE(task.completed_at, task.follow_up_at) >= CURRENT_DATE - INTERVAL '12 months'
         AND COALESCE(task.completed_at, task.follow_up_at) < CURRENT_DATE + INTERVAL '24 months'
       ORDER BY COALESCE(task.completed_at, task.follow_up_at)`,
      [parsed.businessPartnerId]
    );
    const ics = buildCalendarIcs({ tenantName: feedResult.rows[0].name, entries: entriesResult.rows });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="mobiliti-account-radar.ics"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.send(ics);
  } catch (error) {
    console.error('[AccountRadar] Öffentlicher Kalenderfeed fehlgeschlagen:', error.message);
    return res.status(404).type('text/plain').send('Kalenderfeed nicht gefunden.');
  }
};

exports.getSettings = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;

  try {
    const [settingsResult, staffResult, deliveriesResult, entitlements] = await Promise.all([
      db.query(
        `SELECT digest_frequency, delivery_hour, weekly_day, min_relevance, updated_at
         FROM account_radar_settings
         WHERE business_partner_id = $1`,
        [businessPartnerId]
      ),
      db.query(
        `SELECT app_user.id, app_user.email, app_user.username,
                app_user.first_name, app_user.last_name, app_user.role,
                (recipient.user_id IS NOT NULL) AS selected
         FROM users app_user
         LEFT JOIN account_radar_digest_recipients recipient
           ON recipient.user_id = app_user.id
          AND recipient.business_partner_id = $1
         WHERE app_user.business_partner_id = $1
           AND app_user.is_active = TRUE
           AND LOWER(app_user.role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user')
           AND NULLIF(TRIM(app_user.email), '') IS NOT NULL
         ORDER BY app_user.last_name NULLS LAST, app_user.first_name NULLS LAST, app_user.username`,
        [businessPartnerId]
      ),
      db.query(
        `SELECT status, signal_count, recipient_email, created_at, sent_at, error_message
         FROM account_radar_digest_deliveries
         WHERE business_partner_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [businessPartnerId]
      ),
      getBusinessPartnerSalesPlan(db, businessPartnerId),
    ]);

    res.json({
      settings: settingsResult.rows[0] || {
        digest_frequency: 'off',
        delivery_hour: 8,
        weekly_day: 1,
        min_relevance: 70,
      },
      staff: staffResult.rows,
      recentDeliveries: deliveriesResult.rows,
      entitlements,
    });
  } catch (error) {
    console.error('[AccountRadar] Einstellungen konnten nicht geladen werden:', error.message);
    res.status(500).json({ message: 'Radar-Einstellungen konnten nicht geladen werden.' });
  }
};

exports.updateSettings = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;

  const digestFrequency = String(req.body?.digest_frequency || 'off');
  const deliveryHour = Number(req.body?.delivery_hour);
  const weeklyDay = Number(req.body?.weekly_day ?? 1);
  const minRelevance = Number(req.body?.min_relevance);
  const recipientIds = [...new Set(Array.isArray(req.body?.recipient_ids) ? req.body.recipient_ids : [])];
  let entitlements;
  try {
    entitlements = await getBusinessPartnerSalesPlan(db, businessPartnerId);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }

  if (!ALLOWED_FREQUENCIES.has(digestFrequency)) {
    return res.status(400).json({ message: 'Ungültige Versandfrequenz.' });
  }
  if (!entitlements.features.frequentDigest && ['daily', 'weekdays'].includes(digestFrequency)) {
    return res.status(403).json({
      message: 'Täglicher beziehungsweise werktäglicher Versand ist in Sales Premium enthalten.',
      code: 'SALES_FEATURE_NOT_INCLUDED',
      feature: 'frequentDigest',
    });
  }
  if (!Number.isInteger(deliveryHour) || deliveryHour < 0 || deliveryHour > 23) {
    return res.status(400).json({ message: 'Die Versandstunde muss zwischen 0 und 23 liegen.' });
  }
  if (!Number.isInteger(weeklyDay) || weeklyDay < 1 || weeklyDay > 7) {
    return res.status(400).json({ message: 'Ungültiger Wochentag.' });
  }
  if (!Number.isInteger(minRelevance) || minRelevance < 1 || minRelevance > 99) {
    return res.status(400).json({ message: 'Die Mindest-Relevanz muss zwischen 1 und 99 liegen.' });
  }
  if (recipientIds.length > entitlements.limits.digestRecipients) {
    return res.status(409).json({
      message: `${entitlements.label} erlaubt maximal ${entitlements.limits.digestRecipients} Report-Empfänger.`,
      code: 'SALES_RECIPIENT_LIMIT_REACHED',
    });
  }
  if (recipientIds.some((id) => !UUID_PATTERN.test(String(id)))) {
    return res.status(400).json({ message: 'Die Empfängerauswahl ist ungültig.' });
  }
  if (digestFrequency !== 'off' && recipientIds.length === 0) {
    return res.status(400).json({ message: 'Bitte mindestens einen Empfänger auswählen oder den Versand deaktivieren.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (recipientIds.length) {
      const allowedUsers = await client.query(
        `SELECT id
         FROM users
         WHERE business_partner_id = $1
           AND is_active = TRUE
           AND LOWER(role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user')
           AND NULLIF(TRIM(email), '') IS NOT NULL
           AND id = ANY($2::uuid[])`,
        [businessPartnerId, recipientIds]
      );
      if (allowedUsers.rowCount !== recipientIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Mindestens ein Empfänger gehört nicht zum Mandanten oder ist nicht berechtigt.' });
      }
    }

    await client.query(
      `INSERT INTO account_radar_settings
          (business_partner_id, digest_frequency, delivery_hour, weekly_day, min_relevance, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (business_partner_id) DO UPDATE
       SET digest_frequency = EXCLUDED.digest_frequency,
           delivery_hour = EXCLUDED.delivery_hour,
           weekly_day = EXCLUDED.weekly_day,
           min_relevance = EXCLUDED.min_relevance,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = CURRENT_TIMESTAMP`,
      [businessPartnerId, digestFrequency, deliveryHour, weeklyDay, minRelevance, req.user.id]
    );
    await client.query(
      'DELETE FROM account_radar_digest_recipients WHERE business_partner_id = $1',
      [businessPartnerId]
    );
    for (const recipientId of recipientIds) {
      await client.query(
        `INSERT INTO account_radar_digest_recipients (business_partner_id, user_id)
         VALUES ($1, $2)`,
        [businessPartnerId, recipientId]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Daily-Radar-Einstellungen gespeichert.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[AccountRadar] Einstellungen konnten nicht gespeichert werden:', error.message);
    res.status(500).json({ message: 'Radar-Einstellungen konnten nicht gespeichert werden.' });
  } finally {
    client.release();
  }
};

exports.previewDigest = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  const minRelevance = Math.min(Math.max(Number(req.query.minRelevance || 70), 1), 99);

  try {
    const preview = await buildRadarDigestPreview({
      businessPartnerId,
      userId: req.user.id,
      minRelevance,
    });
    res.json({
      signalCount: preview.signals.length,
      campaignCount: preview.campaigns.length,
      campaigns: preview.campaigns,
      signals: preview.signals,
    });
  } catch (error) {
    console.error('[AccountRadar] Vorschau konnte nicht geladen werden:', error.message);
    res.status(500).json({ message: 'Daily-Radar-Vorschau konnte nicht geladen werden.' });
  }
};

exports.sendTestDigest = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  const minRelevance = Number(req.body?.min_relevance ?? 70);
  if (!Number.isInteger(minRelevance) || minRelevance < 1 || minRelevance > 99) {
    return res.status(400).json({ message: 'Die Mindest-Relevanz muss zwischen 1 und 99 liegen.' });
  }

  try {
    const result = await sendAccountRadarTestEmail({
      businessPartnerId,
      userId: req.user.id,
      minRelevance,
    });
    if (!result.sent) {
      await logActivity({
        userId: req.user.id,
        username: req.user.username,
        actionType: 'ACCOUNT_RADAR_TEST_EMAIL_SKIPPED',
        status: 'success',
        targetId: businessPartnerId,
        targetType: 'business_partner',
        details: { signalCount: 0, minRelevance },
        ipAddress: req.ip,
      });
      return res.status(409).json({
        message: 'Aktuell gibt es weder passende offene Signale noch aktive Kampagnen. Bitte zuerst Accounts, Inhalte oder eine Kampagne ergänzen.',
        signalCount: 0,
        campaignCount: result.campaignCount || 0,
      });
    }
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_TEST_EMAIL_SENT',
      status: 'success',
      targetId: businessPartnerId,
      targetType: 'business_partner',
      details: { signalCount: result.signalCount, campaignCount: result.campaignCount, minRelevance, recipient: result.email },
      ipAddress: req.ip,
    });
    return res.json({
      message: `Testmail mit ${result.signalCount} Signalen und ${result.campaignCount || 0} Kampagnen wurde ausschließlich an ${result.email} gesendet.`,
      signalCount: result.signalCount,
      campaignCount: result.campaignCount || 0,
      recipient: result.email,
    });
  } catch (error) {
    console.error('[AccountRadar] Testmail konnte nicht gesendet werden:', error.message);
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_TEST_EMAIL_FAILED',
      status: 'failure',
      targetId: businessPartnerId,
      targetType: 'business_partner',
      details: { minRelevance, error: String(error?.message || error).slice(0, 500) },
      ipAddress: req.ip,
    });
    const knownError = ['RADAR_RECIPIENT_MISSING', 'RADAR_PARTNER_MISSING'].includes(error.code);
    return res.status(knownError ? 400 : 500).json({
      message: knownError ? error.message : 'Die Radar-Testmail konnte nicht gesendet werden.',
    });
  }
};

exports.exportAccounts = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;

  try {
    const { rows } = await db.query(`
      SELECT
        account.id::text AS account_id,
        account.external_id AS account_external_id,
        account.name,
        account.website_url,
        account.linkedin_url,
        account.logo_url,
        account.status,
        account.notes,
        account.is_active,
        account.address,
        account.contact_email,
        account.contact_phone,
        account.owner_user_id::text,
        owner.email AS owner_user_email,
        contact.id::text AS contact_id,
        contact.external_id AS contact_external_id,
        contact.name AS contact_name,
        contact.job_title,
        contact.email AS contact_email_person,
        contact.phone AS contact_phone_person,
        contact.linkedin_url AS contact_linkedin_url,
        contact.notes AS contact_notes,
        contact.is_primary
      FROM business_partner_accounts account
      LEFT JOIN users owner ON owner.id = account.owner_user_id
      LEFT JOIN business_partner_account_contacts contact ON contact.account_id = account.id
      WHERE account.business_partner_id = $1
      ORDER BY account.name, contact.is_primary DESC NULLS LAST, contact.name
    `, [businessPartnerId]);

    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_ACCOUNTS_EXPORTED',
      status: 'success',
      targetId: businessPartnerId,
      targetType: 'business_partner',
      details: { rows: rows.length },
      ipAddress: req.ip,
    });

    const statusLabels = { prospect: 'Interessent', active_customer: 'Kunde', churned: 'Ehemalig' };
    return sendCsv(
      res,
      `account-radar-accounts-kontakte-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Account-ID', 'Externe Account-ID', 'Name', 'Website', 'LinkedIn', 'Logo-URL', 'Status', 'Notizen', 'Aktiv',
        'Adresse', 'Zentrale E-Mail', 'Zentrales Telefon', 'Account-Verantwortlich-ID', 'Account-Verantwortlich-E-Mail', 'Ansprechpartner-ID',
        'Externe Kontakt-ID', 'Ansprechpartner', 'Funktion', 'Kontakt-E-Mail', 'Kontakt-Telefon',
        'Kontakt-LinkedIn', 'Kontakt-Notizen', 'Primärkontakt',
      ],
      rows.map((row) => [
        row.account_id, row.account_external_id, row.name, row.website_url, row.linkedin_url, row.logo_url,
        statusLabels[row.status] || row.status, row.notes, row.is_active ? 'Ja' : 'Nein',
        row.address, row.contact_email, row.contact_phone, row.owner_user_id, row.owner_user_email, row.contact_id,
        row.contact_external_id, row.contact_name, row.job_title, row.contact_email_person, row.contact_phone_person,
        row.contact_linkedin_url, row.contact_notes, row.is_primary ? 'Ja' : 'Nein',
      ])
    );
  } catch (error) {
    console.error('[AccountRadar] Account-Export fehlgeschlagen:', error.message);
    return res.status(500).json({ message: 'Accounts und Kontakte konnten nicht exportiert werden.' });
  }
};

exports.exportTasks = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;

  try {
    const { rows } = await db.query(`
      SELECT
        task.id::text AS task_id,
        task.external_id AS task_external_id,
        article.id::text AS signal_id,
        account.id::text AS account_id,
        account.name AS account_name,
        article.article_title,
        article.article_url,
        task.task_status,
        task.sales_stage,
        task.priority,
        task.opportunity_value_eur,
        task.opportunity_probability,
        task.first_contact_at,
        task.action_type,
        task.follow_up_at,
        task.assigned_user_id::text,
        assigned.email AS assigned_user_email,
        contact.id::text AS contact_id,
        contact.external_id AS contact_external_id,
        contact.name AS contact_name,
        task.contact_channel,
        task.note,
        task.updated_at
      FROM account_radar_tasks task
      JOIN business_partner_tracked_articles article ON article.id = task.tracked_article_id
      JOIN business_partner_accounts account ON account.id = article.account_id
      LEFT JOIN users assigned ON assigned.id = task.assigned_user_id
      LEFT JOIN business_partner_account_contacts contact
        ON contact.id = task.contact_id
       AND contact.account_id = account.id
      WHERE task.business_partner_id = $1
        AND account.business_partner_id = $1
        AND task.task_status <> 'cancelled'
      ORDER BY task.updated_at DESC, account.name
    `, [businessPartnerId]);

    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_TASKS_EXPORTED',
      status: 'success',
      targetId: businessPartnerId,
      targetType: 'business_partner',
      details: { rows: rows.length },
      ipAddress: req.ip,
    });

    const taskLabels = { open: 'Offen', done: 'Erledigt' };
    const stageLabels = { contacted: 'Kontaktiert', meeting: 'Termin vereinbart', offer: 'Angebot', won: 'Gewonnen', lost: 'Verloren' };
    const actionLabels = { contact_planned: 'Kontakt geplant', follow_up: 'Wiedervorlage' };
    const channelLabels = { email: 'E-Mail', phone: 'Telefon', linkedin: 'LinkedIn', video_call: 'Video-Call', in_person: 'Persönlich', contact_form: 'Kontaktformular', other: 'Sonstiger Kanal' };
    return sendCsv(
      res,
      `account-radar-aufgaben-ergebnisse-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Aufgabe-ID', 'Externe Aufgabe-ID', 'Signal-ID', 'Account-ID', 'Account', 'Signal', 'Quelle-URL',
        'Aufgabenstatus', 'Vertriebsphase', 'Priorität', 'Opportunity-Wert EUR', 'Abschlusswahrscheinlichkeit %', 'Erstkontakt', 'Aktion', 'Termin', 'Verantwortlich-ID',
        'Verantwortlich-E-Mail', 'Ansprechpartner-ID', 'Externe Kontakt-ID', 'Ansprechpartner',
        'Kontaktkanal', 'Notiz', 'Aktualisiert',
      ],
      rows.map((row) => [
        row.task_id, row.task_external_id, row.signal_id, row.account_id, row.account_name, row.article_title, row.article_url,
        taskLabels[row.task_status] || row.task_status, stageLabels[row.sales_stage] || row.sales_stage,
        row.priority, row.opportunity_value_eur, row.opportunity_probability,
        row.first_contact_at ? new Date(row.first_contact_at).toISOString() : '',
        actionLabels[row.action_type] || row.action_type, row.follow_up_at ? new Date(row.follow_up_at).toISOString() : '',
        row.assigned_user_id, row.assigned_user_email, row.contact_id, row.contact_external_id, row.contact_name,
        channelLabels[row.contact_channel] || row.contact_channel, row.note,
        row.updated_at ? new Date(row.updated_at).toISOString() : '',
      ])
    );
  } catch (error) {
    console.error('[AccountRadar] Aufgaben-Export fehlgeschlagen:', error.message);
    return res.status(500).json({ message: 'Aufgaben und Ergebnisse konnten nicht exportiert werden.' });
  }
};

exports.importAccounts = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  if (!req.file?.buffer) return res.status(400).json({ message: 'Bitte eine CSV- oder Excel-Datei auswählen.' });

  let rows;
  try {
    rows = readImportRows(req.file.buffer);
  } catch (error) {
    return res.status(400).json({ message: 'Die Datei konnte nicht als CSV-/Excel-Tabelle gelesen werden.' });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'Die Tabelle enthält keine Datensätze.' });
  }
  let entitlements;
  try {
    entitlements = await getBusinessPartnerSalesPlan(db, businessPartnerId);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Sales-Paket konnte nicht geprüft werden.' });
  }
  if (rows.length > entitlements.limits.importRows) {
    return res.status(400).json({ message: `Pro Import sind in ${entitlements.label} maximal ${entitlements.limits.importRows.toLocaleString('de-DE')} Zeilen erlaubt.` });
  }

  const overwrite = String(req.body?.overwrite || '').toLowerCase() === 'true';
  const client = await db.connect();
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    contacts_created: 0,
    contacts_updated: 0,
    contacts_skipped: 0,
    invalid: 0,
    errors: [],
  };

  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      `SELECT id::text, external_id, LOWER(TRIM(name)) AS normalized_name
       FROM business_partner_accounts
       WHERE business_partner_id = $1`,
      [businessPartnerId]
    );
    const existingByName = new Map(existingResult.rows.map((row) => [row.normalized_name, row.id]));
    const existingById = new Map(existingResult.rows.map((row) => [row.id, row.id]));
    const existingByExternalId = new Map(existingResult.rows.filter((row) => row.external_id).map((row) => [row.external_id, row.id]));
    const existingContactsResult = await client.query(`
      SELECT contact.id::text, contact.account_id::text, contact.external_id, LOWER(TRIM(contact.name)) AS normalized_name,
             LOWER(TRIM(contact.email)) AS normalized_email
      FROM business_partner_account_contacts contact
      JOIN business_partner_accounts account ON account.id = contact.account_id
      WHERE account.business_partner_id = $1
    `, [businessPartnerId]);
    const contactsById = new Map(existingContactsResult.rows.map((row) => [row.id, row]));
    const contactsByIdentity = new Map();
    existingContactsResult.rows.forEach((row) => {
      if (row.external_id) contactsByIdentity.set(`${row.account_id}|external:${row.external_id}`, row);
      if (row.normalized_email) contactsByIdentity.set(`${row.account_id}|email:${row.normalized_email}`, row);
      contactsByIdentity.set(`${row.account_id}|name:${row.normalized_name}`, row);
    });
    const processedAccounts = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      await client.query('SAVEPOINT account_import_row');
      try {
        const name = normalizeName(readField(rows[index], ['name', 'account', 'unternehmen', 'firma', 'kunde', 'anzeigenkunde']));
        if (!name) throw new Error('Name fehlt.');
        if (name.length > 180) throw new Error('Name ist länger als 180 Zeichen.');
        const normalizedName = name.toLocaleLowerCase('de');
        const suppliedAccountId = String(readField(rows[index], ['accountid', 'account-id', 'id'])).trim();
        const accountExternalId = normalizeText(readField(rows[index], ['externeaccountid', 'externalaccountid', 'externalid']), 160);
        if (suppliedAccountId && (!UUID_PATTERN.test(suppliedAccountId) || !existingById.has(suppliedAccountId))) {
          throw new Error('Account-ID gehört nicht zu diesem Mandanten. Für neue Accounts das Feld leer lassen.');
        }
        const websiteUrl = normalizeUrl(readField(rows[index], ['website', 'websiteurl', 'url', 'webseite', 'homepage', 'domain']), 'Website');
        const linkedinUrl = normalizeUrl(readField(rows[index], ['linkedin', 'linkedinurl', 'linkedinprofil']), 'LinkedIn-URL');
        const logoUrl = normalizeAssetUrl(readField(rows[index], ['logourl', 'logo-url', 'logo']), 'Logo-URL');
        const status = normalizeStatus(readField(rows[index], ['status', 'phase', 'kundenstatus']));
        const notes = normalizeText(readField(rows[index], ['notes', 'notiz', 'notizen', 'bemerkung', 'bemerkungen']), 4000);
        const isActive = normalizeBoolean(readField(rows[index], ['aktiv', 'active', 'isactive']), true);
        const address = normalizeText(readField(rows[index], ['adresse', 'address']), 1000);
        const centralEmail = normalizeEmail(readField(rows[index], ['zentraleemail', 'accountemail', 'allgemeineemail']));
        const centralPhone = normalizeText(readField(rows[index], ['zentralestelefon', 'zentrales telefon', 'accounttelefon', 'telefonzentrale']), 80);
        const contactName = normalizeText(readField(rows[index], ['ansprechpartner', 'kontaktname', 'contactname']), 200);
        const contactTitle = normalizeText(readField(rows[index], ['funktion', 'position', 'jobtitle', 'rollekontakt']), 200);
        const contactEmail = normalizeEmail(readField(rows[index], ['kontaktemail', 'persoenlicheemail', 'personlicheemail']));
        const contactPhone = normalizeText(readField(rows[index], ['kontakttelefon', 'kontaktphone', 'persoenlichestelefon']), 80);
        const contactLinkedIn = normalizeUrl(readField(rows[index], ['kontaktlinkedin', 'ansprechpartnerlinkedin']), 'Kontakt-LinkedIn');
        const contactNotes = normalizeText(readField(rows[index], ['kontaktnotizen', 'ansprechpartnernotizen']), 2000);
        const hasContactData = Boolean(contactName || contactTitle || contactEmail || contactPhone || contactLinkedIn || contactNotes);
        if (hasContactData && !contactName) throw new Error('Für Kontaktdaten fehlt der Ansprechpartner-Name.');
        const suppliedContactId = String(readField(rows[index], ['ansprechpartnerid', 'kontaktid', 'contactid'])).trim();
        const contactExternalId = normalizeText(readField(rows[index], ['externekontaktid', 'externalcontactid']), 160);
        if (suppliedContactId && !UUID_PATTERN.test(suppliedContactId)) {
          throw new Error('Ansprechpartner-ID ist ungültig. Für neue Kontakte das Feld leer lassen.');
        }
        const externalAccountMatch = accountExternalId ? existingByExternalId.get(accountExternalId) : null;
        let accountId = suppliedAccountId || externalAccountMatch || existingByName.get(normalizedName);
        if (suppliedAccountId && externalAccountMatch && suppliedAccountId !== externalAccountMatch) {
          throw new Error('Account-ID und externe Account-ID verweisen auf unterschiedliche Accounts.');
        }
        if (suppliedContactId) {
          const suppliedContact = contactsById.get(suppliedContactId);
          if (!accountId || !suppliedContact || suppliedContact.account_id !== accountId) {
            throw new Error('Ansprechpartner-ID gehört nicht zu diesem Account. Für neue Kontakte das Feld leer lassen.');
          }
        }
        const accountProcessKey = accountId || `new:${normalizedName}`;

        if (!processedAccounts.has(accountProcessKey)) {
          processedAccounts.add(accountProcessKey);
          if (accountId && overwrite) {
            await client.query(
              `UPDATE business_partner_accounts
               SET external_id = COALESCE($2, external_id),
                   name = $3,
                   website_url = COALESCE($4, website_url),
                   linkedin_url = COALESCE($5, linkedin_url),
                   logo_url = COALESCE($6, logo_url),
                   status = $7,
                   notes = COALESCE($8, notes),
                   is_active = $9,
                   address = COALESCE($10, address),
                   contact_email = COALESCE($11, contact_email),
                   contact_phone = COALESCE($12, contact_phone),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1 AND business_partner_id = $13`,
              [accountId, accountExternalId, name, websiteUrl, linkedinUrl, logoUrl, status, notes, isActive, address, centralEmail, centralPhone, businessPartnerId]
            );
            if (accountExternalId) existingByExternalId.set(accountExternalId, accountId);
            result.updated += 1;
          } else if (accountId) {
            result.skipped += 1;
          } else {
            await assertAccountCapacity(client, businessPartnerId, 1);
            const inserted = await client.query(
              `INSERT INTO business_partner_accounts
                  (business_partner_id, external_id, name, website_url, linkedin_url, logo_url, status, notes, is_active,
                   address, contact_email, contact_phone)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               RETURNING id::text`,
              [businessPartnerId, accountExternalId, name, websiteUrl, linkedinUrl, logoUrl, status, notes, isActive, address, centralEmail, centralPhone]
            );
            accountId = inserted.rows[0].id;
            existingByName.set(normalizedName, accountId);
            existingById.set(accountId, accountId);
            if (accountExternalId) existingByExternalId.set(accountExternalId, accountId);
            processedAccounts.delete(accountProcessKey);
            processedAccounts.add(accountId);
            result.created += 1;
          }
        }

        if (!hasContactData) {
          await client.query('RELEASE SAVEPOINT account_import_row');
          continue;
        }

        let existingContact = null;
        if (suppliedContactId) {
          existingContact = contactsById.get(suppliedContactId) || null;
        } else {
          existingContact = (contactExternalId && contactsByIdentity.get(`${accountId}|external:${contactExternalId}`))
            || (contactEmail && contactsByIdentity.get(`${accountId}|email:${contactEmail}`))
            || contactsByIdentity.get(`${accountId}|name:${contactName.toLocaleLowerCase('de')}`)
            || null;
        }
        const isPrimary = normalizeBoolean(readField(rows[index], ['primaerkontakt', 'primarkontakt', 'isprimary']), false);
        if (existingContact && !overwrite) {
          result.contacts_skipped += 1;
          await client.query('RELEASE SAVEPOINT account_import_row');
          continue;
        }
        if (isPrimary) {
          await client.query('UPDATE business_partner_account_contacts SET is_primary = FALSE WHERE account_id = $1', [accountId]);
        }
        if (existingContact) {
          await client.query(`
            UPDATE business_partner_account_contacts
            SET external_id = COALESCE($2, external_id),
                name = $3,
                job_title = COALESCE($4, job_title),
                email = COALESCE($5, email),
                phone = COALESCE($6, phone),
                linkedin_url = COALESCE($7, linkedin_url),
                notes = COALESCE($8, notes),
                is_primary = $9,
                updated_by_user_id = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND account_id = $11
          `, [existingContact.id, contactExternalId, contactName, contactTitle, contactEmail, contactPhone, contactLinkedIn, contactNotes, isPrimary, req.user.id, accountId]);
          if (contactExternalId) contactsByIdentity.set(`${accountId}|external:${contactExternalId}`, existingContact);
          result.contacts_updated += 1;
        } else {
          const insertedContact = await client.query(`
            INSERT INTO business_partner_account_contacts
                (account_id, external_id, name, job_title, email, phone, linkedin_url, notes, is_primary,
                 created_by_user_id, updated_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
            RETURNING id::text
          `, [accountId, contactExternalId, contactName, contactTitle, contactEmail, contactPhone, contactLinkedIn, contactNotes, isPrimary, req.user.id]);
          const contactRecord = {
            id: insertedContact.rows[0].id,
            account_id: accountId,
            normalized_name: contactName.toLocaleLowerCase('de'),
            normalized_email: contactEmail,
            external_id: contactExternalId,
          };
          contactsById.set(contactRecord.id, contactRecord);
          if (contactEmail) contactsByIdentity.set(`${accountId}|email:${contactEmail}`, contactRecord);
          if (contactExternalId) contactsByIdentity.set(`${accountId}|external:${contactExternalId}`, contactRecord);
          contactsByIdentity.set(`${accountId}|name:${contactRecord.normalized_name}`, contactRecord);
          result.contacts_created += 1;
        }
        await client.query('RELEASE SAVEPOINT account_import_row');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT account_import_row');
        await client.query('RELEASE SAVEPOINT account_import_row');
        result.invalid += 1;
        if (result.errors.length < 25) result.errors.push({ row: rowNumber, message: error.message });
      }
    }

    await client.query('COMMIT');
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_ACCOUNTS_IMPORTED',
      status: 'success',
      targetId: businessPartnerId,
      targetType: 'business_partner',
      details: {
        total: rows.length,
        created: result.created,
        updated: result.updated,
        contactsCreated: result.contacts_created,
        contactsUpdated: result.contacts_updated,
        invalid: result.invalid,
      },
      ipAddress: req.ip,
    });
    res.status(201).json({ ...result, total: rows.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[AccountRadar] Account-Import fehlgeschlagen:', error.message);
    res.status(500).json({ message: 'Der Account-Import ist fehlgeschlagen.' });
  } finally {
    client.release();
  }
};

exports.importTasks = async (req, res) => {
  const businessPartnerId = getTenantId(req, res);
  if (!businessPartnerId) return;
  if (!req.file?.buffer) return res.status(400).json({ message: 'Bitte eine CSV- oder Excel-Datei auswählen.' });

  let rows;
  try {
    rows = readImportRows(req.file.buffer);
  } catch (_) {
    return res.status(400).json({ message: 'Die Datei konnte nicht als CSV-/Excel-Tabelle gelesen werden.' });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'Die Tabelle enthält keine Datensätze.' });
  }
  let entitlements;
  try {
    entitlements = await getBusinessPartnerSalesPlan(db, businessPartnerId);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Sales-Paket konnte nicht geprüft werden.' });
  }
  if (rows.length > entitlements.limits.importRows) {
    return res.status(400).json({ message: `Pro Import sind in ${entitlements.label} maximal ${entitlements.limits.importRows.toLocaleString('de-DE')} Zeilen erlaubt.` });
  }

  const client = await db.connect();
  const result = { created: 0, updated: 0, skipped: 0, invalid: 0, errors: [] };
  try {
    await client.query('BEGIN');
    const [signalsResult, staffResult, contactsResult, tasksResult] = await Promise.all([
      client.query(`
        SELECT article.id::text, article.account_id::text
        FROM business_partner_tracked_articles article
        JOIN business_partner_accounts account ON account.id = article.account_id
        WHERE account.business_partner_id = $1
      `, [businessPartnerId]),
      client.query(`
        SELECT id::text, LOWER(TRIM(email)) AS normalized_email
        FROM users
        WHERE business_partner_id = $1
          AND is_active = TRUE
          AND LOWER(role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user')
      `, [businessPartnerId]),
      client.query(`
        SELECT contact.id::text, contact.account_id::text, contact.external_id, LOWER(TRIM(contact.name)) AS normalized_name
        FROM business_partner_account_contacts contact
        JOIN business_partner_accounts account ON account.id = contact.account_id
        WHERE account.business_partner_id = $1
      `, [businessPartnerId]),
      client.query(`
        SELECT id::text, tracked_article_id::text, external_id
        FROM account_radar_tasks
        WHERE business_partner_id = $1
      `, [businessPartnerId]),
    ]);

    const signalsById = new Map(signalsResult.rows.map((row) => [row.id, row]));
    const staffById = new Map(staffResult.rows.map((row) => [row.id, row]));
    const staffByEmail = new Map(staffResult.rows.filter((row) => row.normalized_email).map((row) => [row.normalized_email, row]));
    const contactsById = new Map(contactsResult.rows.map((row) => [row.id, row]));
    const contactsByAccountAndName = new Map(
      contactsResult.rows.map((row) => [`${row.account_id}|${row.normalized_name}`, row])
    );
    const contactsByAccountAndExternalId = new Map(
      contactsResult.rows.filter((row) => row.external_id).map((row) => [`${row.account_id}|${row.external_id}`, row])
    );
    const tasksBySignalId = new Map(tasksResult.rows.map((row) => [row.tracked_article_id, row]));
    const tasksByExternalId = new Map(tasksResult.rows.filter((row) => row.external_id).map((row) => [row.external_id, row]));

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      await client.query('SAVEPOINT task_import_row');
      try {
        const signalId = String(readField(rows[index], ['signalid', 'signal-id', 'artikelid', 'trackedarticleid'])).trim();
        const taskExternalId = normalizeText(readField(rows[index], ['externeaufgabeid', 'externaltaskid', 'externalid']), 160);
        if (!UUID_PATTERN.test(signalId) || !signalsById.has(signalId)) {
          throw new Error('Signal-ID fehlt oder gehört nicht zu diesem Mandanten. Bitte mit einem aktuellen Aufgaben-Export beginnen.');
        }
        const signal = signalsById.get(signalId);
        let taskStatus = normalizeTaskStatus(readField(rows[index], ['aufgabenstatus', 'taskstatus', 'status']));
        const salesStage = normalizeSalesStage(readField(rows[index], ['vertriebsphase', 'salesstage', 'pipelinephase']));
        const priority = normalizePriority(readField(rows[index], ['prioritat', 'priority']));
        const opportunityValue = normalizeOptionalNumber(readField(rows[index], ['opportunitywerteur', 'opportunitywert', 'umsatzpotenzial']), 'Opportunity-Wert', 0, 100000000);
        let opportunityProbability = normalizeOptionalNumber(readField(rows[index], ['abschlusswahrscheinlichkeit', 'wahrscheinlichkeit', 'opportunityprobability']), 'Abschlusswahrscheinlichkeit', 0, 100, true);
        if (opportunityProbability === null && salesStage) opportunityProbability = ({ contacted: 20, meeting: 40, offer: 70, won: 100, lost: 0 })[salesStage];
        if (salesStage === 'won') opportunityProbability = 100;
        if (salesStage === 'lost') opportunityProbability = 0;
        const actionType = normalizeActionType(readField(rows[index], ['aktion', 'actiontype', 'aufgabe']));
        const followUpAt = normalizeImportDate(readField(rows[index], ['termin', 'followupat', 'faellig', 'fallig', 'datum']));
        const note = normalizeText(readField(rows[index], ['notiz', 'notizen', 'note', 'ergebnis']), 1500);
        let contactChannel = normalizeContactChannel(readField(rows[index], ['kontaktkanal', 'contactchannel', 'kanal']));
        if (actionType && !followUpAt) throw new Error('Für eine Aktion ist ein Termin erforderlich.');
        if (!actionType && followUpAt) throw new Error('Zu einem Termin fehlt die Aktion.');
        if (actionType === 'contact_planned' && !contactChannel) {
          throw new Error('Für „Kontakt geplant“ ist ein Kontaktkanal erforderlich.');
        }
        if (actionType !== 'contact_planned') contactChannel = null;
        if (!actionType && !note && !salesStage && opportunityValue === null && priority === 'normal') {
          throw new Error('Mindestens Aktion, Notiz oder Vertriebsphase ist erforderlich.');
        }
        if (salesStage === 'won' || salesStage === 'lost') taskStatus = 'done';

        const assigneeIdRaw = String(readField(rows[index], ['verantwortlichid', 'verantwortlich-id', 'assigneduserid'])).trim();
        const assigneeEmail = normalizeEmail(readField(rows[index], ['verantwortlichemail', 'verantwortlich-email', 'assigneduseremail']));
        let assignedUser = null;
        if (assigneeIdRaw) {
          if (!UUID_PATTERN.test(assigneeIdRaw) || !staffById.has(assigneeIdRaw)) {
            throw new Error('Verantwortlich-ID gehört nicht zum aktiven Radar-Team dieses Mandanten.');
          }
          assignedUser = staffById.get(assigneeIdRaw);
        } else if (assigneeEmail) {
          assignedUser = staffByEmail.get(assigneeEmail) || null;
          if (!assignedUser) throw new Error('Verantwortlich-E-Mail gehört nicht zum aktiven Radar-Team dieses Mandanten.');
        }

        const contactIdRaw = String(readField(rows[index], ['ansprechpartnerid', 'ansprechpartner-id', 'kontaktid', 'contactid'])).trim();
        const contactExternalId = normalizeText(readField(rows[index], ['externekontaktid', 'externalcontactid']), 160);
        const contactName = normalizeText(readField(rows[index], ['ansprechpartner', 'kontaktname', 'contactname']), 200);
        let contact = null;
        if (contactIdRaw) {
          if (!UUID_PATTERN.test(contactIdRaw)) throw new Error('Ansprechpartner-ID ist ungültig.');
          contact = contactsById.get(contactIdRaw) || null;
        } else if (contactExternalId) {
          contact = contactsByAccountAndExternalId.get(`${signal.account_id}|${contactExternalId}`) || null;
        } else if (contactName) {
          contact = contactsByAccountAndName.get(`${signal.account_id}|${contactName.toLocaleLowerCase('de')}`) || null;
        }
        if ((contactIdRaw || contactExternalId || contactName) && (!contact || contact.account_id !== signal.account_id)) {
          throw new Error('Ansprechpartner gehört nicht zum Account dieses Signals.');
        }

        const existingTask = tasksBySignalId.get(signalId) || null;
        const externalTask = taskExternalId ? tasksByExternalId.get(taskExternalId) : null;
        if (externalTask && externalTask.tracked_article_id !== signalId) {
          throw new Error('Externe Aufgabe-ID und Signal-ID verweisen auf unterschiedliche Aufgaben.');
        }
        const taskResult = await client.query(`
          INSERT INTO account_radar_tasks (
            business_partner_id, tracked_article_id, assigned_user_id, action_type,
            follow_up_at, contact_id, contact_channel, note, sales_stage, sales_stage_updated_at,
            priority, opportunity_value_eur, opportunity_probability, first_contact_at,
            task_status, created_by_user_id, updated_by_user_id, external_id, completed_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            CASE WHEN $9::text IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
            $10, $11, $12, CASE WHEN $9::text IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
            $13, $14, $14, $15, CASE WHEN $13 = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END
          )
          ON CONFLICT (tracked_article_id)
          DO UPDATE SET
            assigned_user_id = EXCLUDED.assigned_user_id,
            action_type = EXCLUDED.action_type,
            follow_up_at = EXCLUDED.follow_up_at,
            contact_id = EXCLUDED.contact_id,
            contact_channel = EXCLUDED.contact_channel,
            note = EXCLUDED.note,
            sales_stage = EXCLUDED.sales_stage,
            priority = EXCLUDED.priority,
            opportunity_value_eur = EXCLUDED.opportunity_value_eur,
            opportunity_probability = EXCLUDED.opportunity_probability,
            external_id = COALESCE(EXCLUDED.external_id, account_radar_tasks.external_id),
            first_contact_at = CASE
              WHEN account_radar_tasks.first_contact_at IS NULL AND EXCLUDED.sales_stage IS NOT NULL THEN CURRENT_TIMESTAMP
              ELSE account_radar_tasks.first_contact_at
            END,
            sales_stage_updated_at = CASE
              WHEN account_radar_tasks.sales_stage IS DISTINCT FROM EXCLUDED.sales_stage THEN CURRENT_TIMESTAMP
              ELSE account_radar_tasks.sales_stage_updated_at
            END,
            task_status = EXCLUDED.task_status,
            completed_at = CASE WHEN EXCLUDED.task_status = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END,
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = CURRENT_TIMESTAMP
          WHERE account_radar_tasks.business_partner_id = $1
          RETURNING id::text
        `, [
          businessPartnerId,
          signalId,
          assignedUser?.id || null,
          actionType,
          followUpAt,
          contact?.id || null,
          contactChannel,
          note,
          salesStage,
          priority,
          opportunityValue,
          opportunityProbability,
          taskStatus,
          req.user.id,
          taskExternalId,
        ]);
        if (!taskResult.rows[0]) throw new Error('Die bestehende Aufgabe gehört nicht zu diesem Mandanten.');

        await client.query(`
          INSERT INTO account_intelligence_item_status (user_id, tracked_article_id, status, updated_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, tracked_article_id)
          DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
        `, [req.user.id, signalId, taskStatus === 'done' ? 'done' : 'read']);
        await client.query(`
          INSERT INTO account_radar_task_events
              (task_id, business_partner_id, actor_user_id, event_type, event_data)
          VALUES ($1, $2, $3, 'imported', $4::jsonb)
        `, [taskResult.rows[0].id, businessPartnerId, req.user.id, JSON.stringify({
          task_status: taskStatus,
          sales_stage: salesStage,
          priority,
          opportunity_value_eur: opportunityValue,
          opportunity_probability: opportunityProbability,
          action_type: actionType,
          follow_up_at: followUpAt,
          assigned_user_id: assignedUser?.id || null,
          contact_id: contact?.id || null,
          external_id: taskExternalId,
          contact_name: contactName || null,
          contact_channel: contactChannel,
          source: 'csv_excel_import',
        })]);
        await client.query('RELEASE SAVEPOINT task_import_row');

        if (existingTask) {
          result.updated += 1;
          if (taskExternalId) {
            existingTask.external_id = taskExternalId;
            tasksByExternalId.set(taskExternalId, existingTask);
          }
        } else {
          result.created += 1;
          const newTask = { id: taskResult.rows[0].id, tracked_article_id: signalId, external_id: taskExternalId };
          tasksBySignalId.set(signalId, newTask);
          if (taskExternalId) tasksByExternalId.set(taskExternalId, newTask);
        }
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT task_import_row');
        await client.query('RELEASE SAVEPOINT task_import_row');
        result.invalid += 1;
        if (result.errors.length < 25) result.errors.push({ row: rowNumber, message: error.message });
      }
    }

    await client.query('COMMIT');
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_TASKS_IMPORTED',
      status: 'success',
      targetId: businessPartnerId,
      targetType: 'business_partner',
      details: { total: rows.length, created: result.created, updated: result.updated, invalid: result.invalid },
      ipAddress: req.ip,
    });
    return res.status(201).json({ ...result, total: rows.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[AccountRadar] Aufgaben-Import fehlgeschlagen:', error.message);
    return res.status(500).json({ message: 'Der Aufgaben-Import ist fehlgeschlagen.' });
  } finally {
    client.release();
  }
};
