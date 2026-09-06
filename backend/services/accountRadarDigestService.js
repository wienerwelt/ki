const db = require('../config/db');
const { sendEmail } = require('./emailService');
const { renderLayout } = require('./emailTemplates');
const { classifyAccountRadarSignal } = require('./accountRadarSignalClassifier');
const { renderAccountRadarManagementPdf } = require('./managementPdfService');
const { getAccountRadarAnalytics } = require('./accountRadarAnalyticsService');
const { getSalesPlanDefinition } = require('./salesPlanService');

const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const getViennaClock = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});

  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: weekdayMap[parts.weekday] || 1,
  };
};

const getWeekStart = (localDate, weekday) => {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (weekday - 1));
  return date.toISOString().slice(0, 10);
};

const getCampaignKey = (settings, clock) => settings.digest_frequency === 'weekly'
  ? `weekly:${getWeekStart(clock.date, clock.weekday)}`
  : `${settings.digest_frequency}:${clock.date}`;

const getPrimaryColor = (partner) => {
  const candidate = String(partner?.color_scheme?.primary_color || '').trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : '#e31b23';
};

const getPrimaryTextColor = (partner) => {
  const candidate = String(partner?.color_scheme?.primary_text_color || '').trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : '#ffffff';
};

const getSafeHttpUrl = (value, fallback = '#') => {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : fallback;
  } catch (_) {
    return fallback;
  }
};

const SALES_STAGE_LABELS = {
  contacted: 'Kontaktiert',
  meeting: 'Termin vereinbart',
  offer: 'Angebot',
  won: 'Gewonnen',
  lost: 'Verloren',
};

const CONTACT_CHANNEL_LABELS = {
  email: 'E-Mail',
  phone: 'Telefon',
  linkedin: 'LinkedIn',
  video_call: 'Video-Call',
  in_person: 'Persönlich',
  contact_form: 'Kontaktformular',
  other: 'Sonstiger Kanal',
};

const formatViennaDate = (value = new Date()) => new Intl.DateTimeFormat('de-AT', {
  timeZone: 'Europe/Vienna',
  dateStyle: 'long',
  timeStyle: 'short',
}).format(new Date(value));

const CAMPAIGN_STATUS_LABELS = Object.freeze({
  draft: 'Entwurf',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
});

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const getCampaignGoalProgress = (campaign) => {
  const pairs = [
    [campaign.account_count, campaign.target_accounts],
    [campaign.contacted_count, campaign.target_contacts],
    [campaign.meeting_count, campaign.target_meetings],
    [campaign.offer_count, campaign.target_offers],
    [campaign.won_count, campaign.target_wins],
    [campaign.open_pipeline_value_eur, campaign.target_pipeline_eur],
  ];
  const values = pairs
    .filter(([, target]) => asNumber(target) > 0)
    .map(([actual, target]) => Math.min(100, (asNumber(actual) / asNumber(target)) * 100));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
};

async function getRadarCampaignSummaries(businessPartnerId) {
  const { rows } = await db.query(`
    SELECT
      campaign.id::text,
      campaign.name,
      campaign.status,
      campaign.starts_on,
      campaign.ends_on,
      campaign.target_accounts,
      campaign.target_contacts,
      campaign.target_meetings,
      campaign.target_offers,
      campaign.target_wins,
      campaign.target_pipeline_eur,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', owner.first_name, owner.last_name)), ''), owner.username) AS owner_name,
      (SELECT COUNT(*)::int
       FROM account_radar_campaign_accounts assigned_account
       WHERE assigned_account.campaign_id = campaign.id) AS account_count,
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
        COUNT(*)::int AS signal_count,
        COUNT(task.id) FILTER (WHERE task.task_status = 'open')::int AS open_task_count,
        COUNT(task.id) FILTER (
          WHERE task.task_status = 'open' AND task.follow_up_at >= CURRENT_TIMESTAMP
        )::int AS planned_count,
        COUNT(task.id) FILTER (
          WHERE task.task_status = 'open' AND task.follow_up_at < CURRENT_TIMESTAMP
        )::int AS overdue_count,
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
      AND campaign.status <> 'archived'
    ORDER BY
      CASE campaign.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
      campaign.ends_on NULLS LAST,
      campaign.name
    LIMIT 12
  `, [businessPartnerId]);

  return rows.map((campaign) => ({
    ...campaign,
    account_count: asNumber(campaign.account_count),
    signal_count: asNumber(campaign.signal_count),
    open_task_count: asNumber(campaign.open_task_count),
    planned_count: asNumber(campaign.planned_count),
    overdue_count: asNumber(campaign.overdue_count),
    done_count: asNumber(campaign.done_count),
    contacted_count: asNumber(campaign.contacted_count),
    meeting_count: asNumber(campaign.meeting_count),
    offer_count: asNumber(campaign.offer_count),
    won_count: asNumber(campaign.won_count),
    target_accounts: campaign.target_accounts == null ? null : asNumber(campaign.target_accounts),
    target_contacts: campaign.target_contacts == null ? null : asNumber(campaign.target_contacts),
    target_meetings: campaign.target_meetings == null ? null : asNumber(campaign.target_meetings),
    target_offers: campaign.target_offers == null ? null : asNumber(campaign.target_offers),
    target_wins: campaign.target_wins == null ? null : asNumber(campaign.target_wins),
    target_pipeline_eur: campaign.target_pipeline_eur == null ? null : asNumber(campaign.target_pipeline_eur),
    open_pipeline_value_eur: asNumber(campaign.open_pipeline_value_eur),
    weighted_pipeline_value_eur: asNumber(campaign.weighted_pipeline_value_eur),
  }));
}

const renderRadarManagementReport = ({ partner, signals }) => {
  const primaryColor = getPrimaryColor(partner);
  const uniqueAccounts = new Set(signals.map((signal) => signal.account_name).filter(Boolean));
  const highRelevance = signals.filter((signal) => Number(signal.relevance_score || 0) >= 80).length;
  const competitorSignals = signals.filter((signal) => Boolean(signal.competitor_name)).length;
  const averageRelevance = signals.length
    ? Math.round(signals.reduce((sum, signal) => sum + Number(signal.relevance_score || 0), 0) / signals.length)
    : 0;
  const accountSummary = Array.from(signals.reduce((result, signal) => {
    const name = signal.account_name || 'Account';
    const current = result.get(name) || { name, count: 0, high: 0, maxRelevance: 0 };
    current.count += 1;
    if (Number(signal.relevance_score || 0) >= 80) current.high += 1;
    current.maxRelevance = Math.max(current.maxRelevance, Number(signal.relevance_score || 0));
    result.set(name, current);
    return result;
  }, new Map()).values()).sort((left, right) => right.high - left.high || right.count - left.count || right.maxRelevance - left.maxRelevance);
  const stageSummary = Object.entries(SALES_STAGE_LABELS)
    .map(([stage, label]) => ({ label, count: signals.filter((signal) => signal.sales_stage === stage).length }))
    .filter((item) => item.count > 0);

  const kpi = (value, label, tone = primaryColor) => `
    <div class="kpi" style="border-top-color:${tone}">
      <strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>
    </div>`;

  return `<!doctype html>
  <html lang="de"><head><meta charset="utf-8"><title>Account-Radar Management-Auswertung</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#142033;margin:0;font-size:11px;line-height:1.4}
    h1{font-size:25px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 9px;color:#142033}
    .muted{color:#64748b}.header{border-bottom:4px solid ${primaryColor};padding-bottom:14px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:18px}.kpi{border:1px solid #dfe5ec;border-top:4px solid;border-radius:9px;padding:11px;background:#f8fafc}
    .kpi strong{display:block;font-size:22px;line-height:1.05}.kpi span{display:block;color:#64748b;margin-top:5px}
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:15px}.card{padding:12px;border:1px solid #dfe5ec;border-radius:9px;background:white}
    table{width:100%;border-collapse:collapse} th{text-align:left;color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #dfe5ec;padding:7px 5px}
    td{vertical-align:top;border-bottom:1px solid #edf1f5;padding:8px 5px}.score{font-weight:700;color:${primaryColor};white-space:nowrap}
    .pill{display:inline-block;border-radius:999px;background:#eef2f7;padding:3px 7px;margin:2px 3px 2px 0;font-size:9px}.action{color:#166534;font-weight:700}
    .footer{margin-top:18px;padding-top:9px;border-top:1px solid #dfe5ec;color:#64748b;font-size:9px}
  </style></head><body>
    <header class="header">
      <div class="muted">${escapeHtml(partner?.name || 'Mobiliti')} · Management-Auswertung</div>
      <h1>Account-Radar</h1>
      <div>Priorisierte offene Gesprächsanlässe der letzten 30 Tage</div>
      <div class="muted">Erstellt am ${escapeHtml(formatViennaDate())}</div>
    </header>
    <section class="kpis">
      ${kpi(signals.length, 'priorisierte Signale')}
      ${kpi(uniqueAccounts.size, 'betroffene Accounts', '#2563eb')}
      ${kpi(highRelevance, 'hoch relevant', '#dc2626')}
      ${kpi(`${averageRelevance}%`, 'Ø Relevanz', '#16a34a')}
    </section>
    <div class="grid">
      <section><h2>Top-Accounts dieser Auswertung</h2><div class="card">
        ${accountSummary.length ? accountSummary.map((account) => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #edf1f5">
            <strong>${escapeHtml(account.name)}</strong><span>${account.count} Signale · ${account.high} hoch · Spitze ${account.maxRelevance}%</span>
          </div>`).join('') : '<span class="muted">Keine Signale vorhanden.</span>'}
      </div></section>
      <section><h2>Management-Überblick</h2><div class="card">
        <div><strong>${competitorSignals}</strong> Wettbewerbssignale</div>
        <div style="margin-top:8px"><strong>Vertriebsphasen</strong></div>
        <div>${stageSummary.length ? stageSummary.map((item) => `<span class="pill">${escapeHtml(item.label)}: ${item.count}</span>`).join('') : '<span class="muted">Noch keine Phasen gesetzt.</span>'}</div>
      </div></section>
    </div>
    <section><h2>Priorisierte Signale und empfohlene Schritte</h2>
      <table><thead><tr><th style="width:20%">Account</th><th style="width:38%">Signal</th><th style="width:9%">Relevanz</th><th>Nächster Schritt</th></tr></thead><tbody>
      ${signals.map((signal) => `<tr>
        <td><strong>${escapeHtml(signal.account_name || 'Account')}</strong>${signal.competitor_name ? `<br><span class="muted">Wettbewerb: ${escapeHtml(signal.competitor_name)}</span>` : ''}</td>
        <td><a href="${escapeHtml(getSafeHttpUrl(signal.article_url))}">${escapeHtml(signal.article_title)}</a><br><span class="muted">${escapeHtml(signal.signal_type || 'Account-Signal')}</span></td>
        <td class="score">${escapeHtml(signal.relevance_score)}%</td>
        <td class="action">${escapeHtml(signal.recommended_action || 'Signal prüfen und nächsten Schritt festlegen.')}</td>
      </tr>`).join('')}
      </tbody></table>
    </section>
    <footer class="footer">Datenbasis: die in dieser periodischen Zusammenfassung priorisierten, offenen Signale. Die Bewertung unterstützt die Vertriebsarbeit und ersetzt keine fachliche Prüfung. Detailansicht: ${escapeHtml(`${FRONTEND_URL}/radar`)}</footer>
  </body></html>`;
};

async function createRadarManagementPdf({ partner, signals, campaigns = null }) {
  const analyticsPartnerId = partner?.id || partner?.business_partner_id;
  const [analytics, campaignSummaries] = await Promise.all([
    analyticsPartnerId ? getAccountRadarAnalytics(analyticsPartnerId, 30) : null,
    campaigns || (analyticsPartnerId ? getRadarCampaignSummaries(analyticsPartnerId) : []),
  ]);
  return renderAccountRadarManagementPdf({
    partnerName: partner?.name || 'Mobiliti',
    primaryColor: getPrimaryColor(partner),
    generatedAt: formatViennaDate(),
    signals,
    frontendUrl: `${FRONTEND_URL}/radar`,
    salesStageLabels: SALES_STAGE_LABELS,
    analytics,
    campaigns: campaignSummaries,
  });
}

async function getPartner(businessPartnerId) {
  const { rows } = await db.query(
    `SELECT partner.*,
            json_build_object(
              'primary_color', colors.primary_color,
              'primary_text_color', colors.primary_text_color,
              'secondary_color', colors.secondary_color
            ) AS color_scheme
     FROM business_partners partner
     LEFT JOIN color_schemes colors ON colors.id = partner.color_scheme_id
     WHERE partner.id = $1
     LIMIT 1`,
    [businessPartnerId]
  );
  return rows[0] || null;
}

const isDue = (settings, clock) => {
  if (!settings || settings.digest_frequency === 'off') return false;
  const entitlements = getSalesPlanDefinition(settings.sales_plan);
  if (!entitlements.features.frequentDigest && ['daily', 'weekdays'].includes(settings.digest_frequency)) return false;
  if (Number(settings.delivery_hour) !== clock.hour) return false;
  if (settings.digest_frequency === 'weekdays' && clock.weekday > 5) return false;
  if (settings.digest_frequency === 'weekly' && Number(settings.weekly_day) !== clock.weekday) return false;
  return true;
};

async function getRadarSignals({ businessPartnerId, userId, minRelevance = 70, limit = 10 }) {
  const { rows } = await db.query(
    `SELECT
        tracked.id::text,
        tracked.account_id::text,
        tracked.article_title,
        tracked.article_url,
        tracked.source_name,
        tracked.published_at,
        tracked.summary,
        tracked.competitor_name,
        account.name AS account_name,
        radar_task.sales_stage,
        radar_task.contact_channel,
        radar_contact.name AS contact_name,
        COALESCE(item_status.status, 'new') AS status
     FROM business_partner_tracked_articles tracked
     JOIN business_partner_accounts account ON account.id = tracked.account_id
     JOIN business_partners partner ON partner.id = account.business_partner_id
     LEFT JOIN account_intelligence_item_status item_status
       ON item_status.tracked_article_id = tracked.id
      AND item_status.user_id = $2
     LEFT JOIN account_radar_signal_feedback feedback
       ON feedback.tracked_article_id = tracked.id
      AND feedback.business_partner_id = $1
     LEFT JOIN account_radar_tasks radar_task
       ON radar_task.tracked_article_id = tracked.id
      AND radar_task.business_partner_id = $1
     LEFT JOIN business_partner_account_contacts radar_contact
       ON radar_contact.id = radar_task.contact_id
      AND radar_contact.account_id = tracked.account_id
     WHERE account.business_partner_id = $1
       AND (partner.sales_plan = 'premium' OR tracked.competitor_name IS NULL)
       AND COALESCE(account.is_active, TRUE) = TRUE
       AND COALESCE(item_status.status, 'new') IN ('new', 'read')
       AND COALESCE(feedback.relevance_status, 'relevant') <> 'irrelevant'
       AND (radar_task.id IS NULL OR radar_task.task_status = 'open')
       AND (radar_task.assigned_user_id IS NULL OR radar_task.assigned_user_id = $2)
       AND (radar_task.follow_up_at IS NULL OR radar_task.follow_up_at <= CURRENT_TIMESTAMP)
       AND COALESCE(tracked.published_at, tracked.created_at) >= CURRENT_TIMESTAMP - INTERVAL '30 days'
     ORDER BY COALESCE(tracked.published_at, tracked.created_at) DESC
     LIMIT 100`,
    [businessPartnerId, userId]
  );

  return rows
    .map((row) => classifyAccountRadarSignal(row, row.competitor_name ? 'competitor' : 'account'))
    .filter((signal) => signal.relevance_score >= Number(minRelevance || 70))
    .sort((left, right) => {
      const scoreDiff = right.relevance_score - left.relevance_score;
      if (scoreDiff) return scoreDiff;
      return new Date(right.published_at || 0).getTime() - new Date(left.published_at || 0).getTime();
    })
    .slice(0, Math.min(Math.max(Number(limit) || 10, 1), 20));
}

const renderRadarDigest = ({ partner, recipient, signals, campaigns = [] }) => {
  const primaryColor = getPrimaryColor(partner);
  const primaryTextColor = getPrimaryTextColor(partner);
  const euro = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const campaignRows = campaigns.slice(0, 4).map((campaign) => {
    const statusTone = campaign.status === 'active' ? '#166534' : campaign.status === 'completed' ? '#475569' : '#92400e';
    const timing = campaign.overdue_count > 0
      ? `<strong style="color:#b91c1c;">${campaign.overdue_count} überfällig</strong>`
      : `<span style="color:#166534;">${campaign.planned_count} geplant</span>`;
    const goalProgress = getCampaignGoalProgress(campaign);
    return `
      <div style="margin:0 0 8px;padding:11px 12px;border:1px solid #e2e8f0;border-left:4px solid ${statusTone};border-radius:8px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <strong style="color:#0f172a;">${escapeHtml(campaign.name)}</strong>
          <span style="color:${statusTone};font-size:11px;font-weight:800;white-space:nowrap;">${escapeHtml(CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status)}</span>
        </div>
        <div style="margin-top:5px;color:#64748b;font-size:12px;line-height:1.45;">
          ${campaign.account_count} Accounts · ${campaign.signal_count} Signale · ${campaign.open_task_count} offen · ${timing}<br>
          Pipeline ${escapeHtml(euro.format(campaign.open_pipeline_value_eur))} · gewichtet ${escapeHtml(euro.format(campaign.weighted_pipeline_value_eur))}${goalProgress === null ? '' : ` · <strong>Zielgrad ${goalProgress}%</strong>`}${campaign.owner_name ? ` · ${escapeHtml(campaign.owner_name)}` : ''}
        </div>
      </div>`;
  }).join('');
  const signalRows = signals.map((signal) => `
    <div style="margin:0 0 14px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;">
      <div style="margin-bottom:5px;color:#64748b;font-size:12px;font-weight:700;">
        ${escapeHtml(signal.account_name)} · ${escapeHtml(signal.signal_type)} · Relevanz ${escapeHtml(signal.relevance_score)}
      </div>
      <a href="${escapeHtml(getSafeHttpUrl(signal.article_url))}" style="color:#0f172a;font-size:16px;font-weight:800;text-decoration:none;">
        ${escapeHtml(signal.article_title)}
      </a>
      ${signal.summary ? `<p style="margin:8px 0;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(signal.summary).slice(0, 360)}</p>` : ''}
      <p style="margin:8px 0 0;color:#166534;font-size:13px;"><strong>Nächster Schritt:</strong> ${escapeHtml(signal.recommended_action)}</p>
      ${signal.sales_stage ? `<p style="margin:6px 0 0;color:#475569;font-size:12px;"><strong>Vertriebsphase:</strong> ${escapeHtml(SALES_STAGE_LABELS[signal.sales_stage] || signal.sales_stage)}</p>` : ''}
      ${(signal.contact_name || signal.contact_channel) ? `<p style="margin:6px 0 0;color:#475569;font-size:12px;"><strong>Kontakt:</strong> ${escapeHtml([signal.contact_name, CONTACT_CHANNEL_LABELS[signal.contact_channel] || signal.contact_channel].filter(Boolean).join(' · '))}</p>` : ''}
    </div>
  `).join('');

  const recipientName = recipient.first_name || recipient.username || 'Team';
  const includesManagementPdf = getSalesPlanDefinition(partner.sales_plan).features.managementPdf;
  return renderLayout({
    preheader: `${signals.length} relevante Account-Signale · ${campaigns.length} Kampagnen`,
    title: 'Ihr Account-Radar',
    partner,
    contentHtml: `
      <p>Guten Morgen ${escapeHtml(recipientName)},</p>
      <p>hier sind die wichtigsten neuen Gesprächsanlässe und der aktuelle Kampagnenstand für Ihre beobachteten Accounts.</p>
      ${includesManagementPdf ? '<p>Die managementtaugliche Auswertung mit Kennzahlen, Top-Accounts und Handlungsempfehlungen finden Sie zusätzlich als PDF im Anhang.</p>' : ''}
      ${campaignRows ? `<h2 style="margin:22px 0 10px;color:#0f172a;font-size:17px;">Kampagnen im Blick</h2>${campaignRows}` : ''}
      ${signalRows ? `<h2 style="margin:22px 0 10px;color:#0f172a;font-size:17px;">Aktuelle Gesprächsanlässe</h2>${signalRows}` : '<p style="color:#64748b;">Keine neuen priorisierten Signale in dieser Ausgabe.</p>'}
      <p style="margin-top:22px;"><a href="${escapeHtml(getSafeHttpUrl(`${FRONTEND_URL}/radar`))}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:${primaryColor};color:${primaryTextColor};font-weight:800;text-decoration:none;">Account-Radar öffnen</a></p>
      <p style="margin-top:18px;color:#64748b;font-size:12px;">Die Versand- und Empfängereinstellungen verwalten Sie direkt im Account-Radar.</p>
    `,
  });
};

async function buildRadarDigestPreview({ businessPartnerId, userId, minRelevance = 70 }) {
  const [partner, signals, campaigns] = await Promise.all([
    getPartner(businessPartnerId),
    getRadarSignals({ businessPartnerId, userId, minRelevance, limit: 10 }),
    getRadarCampaignSummaries(businessPartnerId),
  ]);
  return { partner, signals, campaigns };
}

async function sendAccountRadarTestEmail({ businessPartnerId, userId, minRelevance = 70 }) {
  const { rows } = await db.query(
    `SELECT id, email, username, first_name, last_name
     FROM users
     WHERE id = $1
       AND business_partner_id = $2
       AND is_active = TRUE
       AND LOWER(role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user')
       AND NULLIF(TRIM(email), '') IS NOT NULL
     LIMIT 1`,
    [userId, businessPartnerId]
  );
  const recipient = rows[0];
  if (!recipient) {
    const error = new Error('Für Ihr Konto ist keine gültige E-Mail-Adresse hinterlegt.');
    error.code = 'RADAR_RECIPIENT_MISSING';
    throw error;
  }

  const { partner, signals, campaigns } = await buildRadarDigestPreview({
    businessPartnerId,
    userId,
    minRelevance,
  });
  if (!partner) {
    const error = new Error('Der zugehörige Mandant wurde nicht gefunden.');
    error.code = 'RADAR_PARTNER_MISSING';
    throw error;
  }
  const hasCampaignActivity = campaigns.some((campaign) => campaign.status === 'active'
    || campaign.open_task_count > 0 || campaign.planned_count > 0 || campaign.overdue_count > 0);
  if (!signals.length && !hasCampaignActivity) {
    return { sent: false, signalCount: 0, campaignCount: campaigns.length, email: recipient.email, reason: 'no_activity' };
  }

  const entitlements = getSalesPlanDefinition(partner.sales_plan);
  const attachments = [];
  if (entitlements.features.managementPdf) {
    const managementPdf = await createRadarManagementPdf({ partner, signals, campaigns });
    attachments.push({
      filename: `account-radar-management-${getViennaClock().date}.pdf`,
      content: managementPdf,
      contentType: 'application/pdf',
    });
  }

  const info = await sendEmail({
    to: recipient.email,
    subject: `[TEST] ${partner.name || 'Account-Radar'}: ${signals.length} Signale · ${campaigns.length} Kampagnen`,
    html: renderRadarDigest({ partner, recipient, signals, campaigns }),
    partner,
    attachments,
  });

  return {
    sent: true,
    signalCount: signals.length,
    campaignCount: campaigns.length,
    email: recipient.email,
    providerMessageId: info?.messageId || null,
  };
}

async function dispatchForSettings(settings, clock) {
  const campaignKey = getCampaignKey(settings, clock);
  const partner = { ...settings, name: settings.partner_name };
  const entitlements = getSalesPlanDefinition(settings.sales_plan);
  const [{ rows: recipientRows }, campaigns] = await Promise.all([
    db.query(
      `SELECT app_user.id, app_user.email, app_user.username, app_user.first_name, app_user.last_name
       FROM account_radar_digest_recipients recipient
       JOIN users app_user ON app_user.id = recipient.user_id
       WHERE recipient.business_partner_id = $1
         AND app_user.business_partner_id = $1
         AND app_user.is_active = TRUE
         AND LOWER(app_user.role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user')
         AND NULLIF(TRIM(app_user.email), '') IS NOT NULL
       ORDER BY app_user.last_name NULLS LAST, app_user.first_name NULLS LAST, app_user.username`,
      [settings.business_partner_id]
    ),
    getRadarCampaignSummaries(settings.business_partner_id),
  ]);
  const recipients = recipientRows.slice(0, entitlements.limits.digestRecipients);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const reservation = await db.query(
      `INSERT INTO account_radar_digest_deliveries
          (business_partner_id, user_id, campaign_key, recipient_email, status)
       VALUES ($1, $2, $3, LOWER($4), 'sending')
       ON CONFLICT (business_partner_id, user_id, campaign_key) DO UPDATE
       SET status = 'sending', error_message = NULL, failed_at = NULL
       WHERE account_radar_digest_deliveries.status = 'failed'
       RETURNING id`,
      [settings.business_partner_id, recipient.id, campaignKey, recipient.email]
    );
    if (!reservation.rows[0]) continue;

    const deliveryId = reservation.rows[0].id;
    try {
      const signals = await getRadarSignals({
        businessPartnerId: settings.business_partner_id,
        userId: recipient.id,
        minRelevance: settings.min_relevance,
        limit: 10,
      });

      const hasCampaignActivity = campaigns.some((campaign) => campaign.status === 'active'
        || campaign.open_task_count > 0 || campaign.planned_count > 0 || campaign.overdue_count > 0);
      if (!signals.length && !hasCampaignActivity) {
        await db.query(
          `UPDATE account_radar_digest_deliveries
           SET status = 'skipped', signal_count = 0
           WHERE id = $1`,
          [deliveryId]
        );
        skipped += 1;
        continue;
      }

      const attachments = [];
      if (entitlements.features.managementPdf) {
        const managementPdf = await createRadarManagementPdf({ partner, signals, campaigns });
        attachments.push({
          filename: `account-radar-management-${clock.date}.pdf`,
          content: managementPdf,
          contentType: 'application/pdf',
        });
      }

      const info = await sendEmail({
        to: recipient.email,
        subject: `${settings.partner_name || 'Account-Radar'}: ${signals.length} Signale · ${campaigns.length} Kampagnen`,
        html: renderRadarDigest({ partner, recipient, signals, campaigns }),
        partner,
        attachments,
      });
      await db.query(
        `UPDATE account_radar_digest_deliveries
         SET status = 'sent', signal_count = $2, provider_message_id = $3, sent_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [deliveryId, signals.length, info?.messageId || null]
      );
      sent += 1;
    } catch (error) {
      await db.query(
        `UPDATE account_radar_digest_deliveries
         SET status = 'failed', error_message = $2, failed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [deliveryId, String(error?.message || error).slice(0, 2000)]
      );
      failed += 1;
      console.error(`[AccountRadarDigest] Versand an ${recipient.email} fehlgeschlagen:`, error.message);
    }
  }

  return { sent, skipped, failed, recipients: recipients.length };
}

async function dispatchAccountRadarDigests(now = new Date()) {
  const clock = getViennaClock(now);
  const { rows: settingsRows } = await db.query(
    `SELECT settings.*, partner.name AS partner_name, partner.email, partner.logo_url,
            partner.sales_plan,
            partner.dashboard_title,
            json_build_object(
              'primary_color', colors.primary_color,
              'primary_text_color', colors.primary_text_color,
              'secondary_color', colors.secondary_color
            ) AS color_scheme
     FROM account_radar_settings settings
     JOIN business_partners partner ON partner.id = settings.business_partner_id
     LEFT JOIN color_schemes colors ON colors.id = partner.color_scheme_id
     WHERE settings.digest_frequency <> 'off'
       AND COALESCE(partner.is_active, TRUE) = TRUE
       AND (
         partner.sales_subscription_status = 'active'
         OR (partner.sales_subscription_status = 'trial' AND partner.sales_trial_ends_on >= CURRENT_DATE)
       )
       AND 'sales' = ANY(COALESCE(partner.enabled_modules, ARRAY['content']::TEXT[]))`
  );

  const dueSettings = settingsRows.filter((settings) => isDue(settings, clock));
  const result = { tenants: dueSettings.length, sent: 0, skipped: 0, failed: 0 };
  for (const settings of dueSettings) {
    const tenantResult = await dispatchForSettings(settings, clock);
    result.sent += tenantResult.sent;
    result.skipped += tenantResult.skipped;
    result.failed += tenantResult.failed;
  }
  console.log('[AccountRadarDigest] Ergebnis:', result);
  return result;
}

module.exports = {
  buildRadarDigestPreview,
  createRadarManagementPdf,
  dispatchAccountRadarDigests,
  getRadarSignals,
  getRadarCampaignSummaries,
  getViennaClock,
  isDue,
  renderRadarManagementReport,
  sendAccountRadarTestEmail,
};
