const db = require('../config/db');
const { emailQueue } = require('./queueService');
const { sendEmail } = require('./emailService');
const { renderMemberNewsletterEmail } = require('./emailTemplates');
const { resolveDeliveryPlan } = require('./newsletterDeliveryService');
const { ACTIVE_MEMBERSHIP_SQL } = require('../utils/membershipExpiry');
const { buildPreferenceUrl, buildOneClickUnsubscribeUrl } = require('./newsletterPreferenceService');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function normalizeFilter(filter = {}) {
  const membershipLevel = String(filter.membership_level || '').trim().slice(0, 100) || null;
  const rawDays = filter.expires_within_days;
  const expiresWithinDays = rawDays === '' || rawDays === null || rawDays === undefined
    ? null
    : Math.max(0, Math.min(3650, Number.parseInt(rawDays, 10)));
  const hasSelection = Object.prototype.hasOwnProperty.call(filter, 'selected_user_ids');
  const rawSelectedIds = hasSelection ? filter.selected_user_ids : null;
  if (rawSelectedIds !== null && !Array.isArray(rawSelectedIds)) {
    throw new Error('Die Empfängerauswahl ist ungültig.');
  }
  const selectedUserIds = rawSelectedIds === null
    ? null
    : [...new Set(rawSelectedIds.map((value) => String(value || '').trim()).filter(Boolean))];
  if (selectedUserIds && selectedUserIds.length > 100000) {
    throw new Error('Die Empfängerauswahl ist zu groß.');
  }
  const invalidId = selectedUserIds?.find((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
  if (invalidId) throw new Error('Die Empfängerauswahl enthält eine ungültige Benutzer-ID.');
  return {
    membership_level: membershipLevel,
    expires_within_days: Number.isFinite(expiresWithinDays) ? expiresWithinDays : null,
    selected_user_ids: selectedUserIds,
  };
}

async function loadPartner(partnerId) {
  const result = await db.query(
    `SELECT bp.*, row_to_json(cs.*) AS color_scheme
     FROM business_partners bp
     LEFT JOIN color_schemes cs ON cs.id = bp.color_scheme_id
     WHERE bp.id = $1 AND bp.is_active = TRUE LIMIT 1`,
    [partnerId]
  );
  return result.rows[0] || null;
}

async function loadEligibleRecipients(partnerId, filter = {}) {
  const normalized = normalizeFilter(filter);
  const result = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.membership_level, u.active_until
     FROM users u
     WHERE u.business_partner_id = $1
       AND u.role = 'user'
       AND u.is_active = TRUE
       AND u.newsletter_opt_in = TRUE
       AND u.member_newsletter_enabled = TRUE
       AND u.newsletter_opt_in_confirmed_at IS NOT NULL
       AND NULLIF(BTRIM(u.email), '') IS NOT NULL
       AND ${ACTIVE_MEMBERSHIP_SQL}
       AND ($2::text IS NULL OR u.membership_level = $2)
       AND (
         $3::integer IS NULL
         OR (
           u.active_until IS NOT NULL
           AND (u.active_until AT TIME ZONE 'Europe/Vienna')::date
             <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Vienna')::date + $3
         )
       )
       AND ($4::uuid[] IS NULL OR u.id = ANY($4::uuid[]))
     ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST, u.email`,
    [partnerId, normalized.membership_level, normalized.expires_within_days, normalized.selected_user_ids]
  );
  return result.rows.filter((row) => isEmail(row.email));
}

async function getRecipientPreview(partnerId, filter = {}) {
  const normalized = normalizeFilter(filter);
  const [recipients, totals, levels] = await Promise.all([
    loadEligibleRecipients(partnerId, normalized),
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE u.role = 'user')::int AS members_total,
         COUNT(*) FILTER (WHERE u.role = 'user' AND u.is_active = FALSE)::int AS inactive,
         COUNT(*) FILTER (
           WHERE u.role = 'user' AND u.active_until IS NOT NULL
             AND (u.active_until AT TIME ZONE 'Europe/Vienna')::date
               < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Vienna')::date
         )::int AS expired,
         COUNT(*) FILTER (
           WHERE u.role = 'user'
             AND (u.newsletter_opt_in IS DISTINCT FROM TRUE
               OR u.member_newsletter_enabled IS DISTINCT FROM TRUE
               OR u.newsletter_opt_in_confirmed_at IS NULL)
         )::int AS without_consent
       FROM users u WHERE u.business_partner_id = $1`,
      [partnerId]
    ),
    db.query(
      `SELECT DISTINCT BTRIM(u.membership_level) AS membership_level
       FROM users u
       WHERE u.business_partner_id = $1
         AND u.role = 'user'
         AND u.is_active = TRUE
         AND u.newsletter_opt_in = TRUE
         AND u.member_newsletter_enabled = TRUE
         AND u.newsletter_opt_in_confirmed_at IS NOT NULL
         AND NULLIF(BTRIM(u.membership_level), '') IS NOT NULL
         AND ${ACTIVE_MEMBERSHIP_SQL}
       ORDER BY membership_level`,
      [partnerId]
    ),
  ]);
  return {
    filter: normalized,
    eligible_count: recipients.length,
    members_total: totals.rows[0]?.members_total || 0,
    excluded: {
      inactive: totals.rows[0]?.inactive || 0,
      expired: totals.rows[0]?.expired || 0,
      without_consent: totals.rows[0]?.without_consent || 0,
    },
    membership_levels: levels.rows.map((row) => row.membership_level),
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      name: [recipient.first_name, recipient.last_name].filter(Boolean).join(' ') || 'Mitglied',
      email: recipient.email,
      membership_level: recipient.membership_level,
      active_until: recipient.active_until,
    })),
  };
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function claimDelivery({ campaign, recipient, mode }) {
  const result = await db.query(
    `INSERT INTO newsletter_deliveries
       (business_partner_id, user_id, recipient_email, delivery_type, campaign_key, delivery_mode, status)
     VALUES ($1, $2, $3, 'member_newsletter', $4, $5, 'sending')
     ON CONFLICT (business_partner_id, delivery_type, campaign_key, recipient_email)
     DO UPDATE SET status = 'sending', error_message = NULL, failed_at = NULL, created_at = CURRENT_TIMESTAMP
     WHERE newsletter_deliveries.status = 'failed'
        OR (newsletter_deliveries.status = 'sending'
            AND newsletter_deliveries.created_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes')
     RETURNING id`,
    [campaign.business_partner_id, recipient.id || null, normalizeEmail(recipient.email), campaign.id, mode]
  );
  return result.rows[0]?.id || null;
}

async function finishDelivery(id, status, info) {
  if (!id) return;
  if (status === 'sent') {
    await db.query(
      `UPDATE newsletter_deliveries SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
       provider_message_id = $2 WHERE id = $1`,
      [id, info?.messageId || null]
    );
  } else {
    await db.query(
      `UPDATE newsletter_deliveries SET status = 'failed', failed_at = CURRENT_TIMESTAMP,
       error_message = $2 WHERE id = $1`,
      [id, String(info?.message || info || 'Unbekannter Versandfehler').slice(0, 2000)]
    );
  }
}

async function sendCentralExport({ campaign, partner, recipients }) {
  const email = normalizeEmail(partner.newsletter_export_email || partner.email);
  if (!isEmail(email)) throw new Error('Für den Export fehlt eine gültige zentrale Mandantenadresse.');
  const deliveryId = await claimDelivery({ campaign, recipient: { email }, mode: 'export' });
  if (!deliveryId) return { sent: 0, skipped: 1, failed: 0 };
  const html = renderMemberNewsletterEmail({ campaign, partner, user: null });
  const csv = [
    ['E-Mail', 'Vorname', 'Nachname', 'Mitgliedschaft', 'Aktiv bis'].map(csvEscape).join(';'),
    ...recipients.map((row) => [row.email, row.first_name, row.last_name, row.membership_level, row.active_until].map(csvEscape).join(';')),
  ].join('\r\n');
  try {
    const info = await sendEmail({
      to: email,
      subject: `[Export] ${campaign.subject}`,
      html: `<p>Fertige Mitglieder-Mail mit ${recipients.length} berechtigten Empfängern im Anhang.</p>${html}`,
      partner,
      attachments: [
        { filename: `mitglieder-mail-${campaign.id}.html`, content: Buffer.from(html), contentType: 'text/html; charset=utf-8' },
        { filename: `empfaenger-${campaign.id}.csv`, content: Buffer.from(`\uFEFF${csv}`), contentType: 'text/csv; charset=utf-8' },
      ],
    });
    await finishDelivery(deliveryId, 'sent', info);
    return { sent: 1, skipped: 0, failed: 0 };
  } catch (error) {
    await finishDelivery(deliveryId, 'failed', error);
    throw error;
  }
}

async function processMemberNewsletterCampaign(campaignId) {
  const result = await db.query(
    `SELECT * FROM member_newsletter_campaigns WHERE id = $1 LIMIT 1`,
    [campaignId]
  );
  const campaign = result.rows[0];
  if (!campaign) throw new Error('Mitglieder-Mail nicht gefunden.');
  const partner = await loadPartner(campaign.business_partner_id);
  if (!partner) throw new Error('Mandant nicht gefunden oder inaktiv.');

  await db.query(
    `UPDATE member_newsletter_campaigns SET status = 'sending', error_message = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [campaign.id]
  );

  try {
    const recipients = await loadEligibleRecipients(campaign.business_partner_id, campaign.recipient_filter);
    const plan = resolveDeliveryPlan(partner, recipients.length);
    if (plan.mode === 'external') {
      throw new Error('Der Mandant nutzt ein externes Newsletter-System. Bitte Empfängerliste und Inhalt dort verwenden.');
    }
    if (recipients.length === 0) throw new Error('Keine berechtigten, aktiven Empfänger gefunden.');

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];
    if (plan.mode === 'export') {
      const counts = await sendCentralExport({ campaign, partner, recipients });
      sent = counts.sent;
      skipped = counts.skipped;
      failed = counts.failed;
    } else {
      for (const recipient of recipients) {
        const deliveryId = await claimDelivery({ campaign, recipient, mode: 'mobiliti' });
        if (!deliveryId) {
          skipped += 1;
          continue;
        }
        const unsubscribeUrl = buildPreferenceUrl(recipient.id);
        const oneClickUrl = buildOneClickUnsubscribeUrl(recipient.id);
        try {
          const info = await sendEmail({
            to: recipient.email,
            subject: campaign.subject,
            html: renderMemberNewsletterEmail({ campaign, partner, user: recipient, unsubscribeUrl }),
            partner,
            headers: {
              'List-Unsubscribe': `<${oneClickUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });
          await finishDelivery(deliveryId, 'sent', info);
          sent += 1;
        } catch (error) {
          await finishDelivery(deliveryId, 'failed', error);
          failed += 1;
          failures.push(`${recipient.email}: ${error.message}`);
        }
      }
      const deliveryTotals = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
         FROM newsletter_deliveries
         WHERE business_partner_id = $1
           AND delivery_type = 'member_newsletter'
           AND campaign_key = $2`,
        [campaign.business_partner_id, campaign.id]
      );
      sent = deliveryTotals.rows[0]?.sent || 0;
      failed = deliveryTotals.rows[0]?.failed || 0;
      skipped = Math.max(0, recipients.length - sent - failed);
    }

    await db.query(
      `UPDATE member_newsletter_campaigns SET status = $2, recipient_count = $3,
       sent_count = $4, skipped_count = $5, failed_count = $6, delivery_mode = $7,
       error_message = $8, sent_at = CASE WHEN $2 = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
       updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [campaign.id, failed > 0 ? 'failed' : 'sent', recipients.length, sent, skipped, failed,
        plan.mode, failures.slice(0, 5).join('; ') || null]
    );
    if (failures.length) throw new Error(`${failures.length} Zustellung(en) fehlgeschlagen.`);
    return { recipientCount: recipients.length, sent, skipped, failed, mode: plan.mode };
  } catch (error) {
    await db.query(
      `UPDATE member_newsletter_campaigns SET status = 'failed', error_message = $2,
       updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [campaign.id, String(error.message || error).slice(0, 2000)]
    );
    throw error;
  }
}

async function enqueueCampaign(campaignId) {
  return emailQueue.add(
    'member-newsletter',
    { campaignId },
    { jobId: `member-newsletter:${campaignId}`, attempts: 3, backoff: { type: 'exponential', delay: 30000 } }
  );
}

module.exports = {
  normalizeFilter,
  loadPartner,
  loadEligibleRecipients,
  getRecipientPreview,
  processMemberNewsletterCampaign,
  enqueueCampaign,
};
