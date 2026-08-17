const crypto = require('crypto');
const db = require('../config/db');
const { sendDailyBriefing, sendEmail } = require('./emailService');
const { renderFleetDailyBriefingEmail } = require('./emailTemplates');

const DEFAULT_RECIPIENT_LIMIT = 250;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function campaignKeyFor(items, frequency, now = new Date()) {
  const ids = (items || []).map((item) => item.id).filter(Boolean).sort();
  const dateKey = now.toISOString().slice(0, 10);
  return crypto.createHash('sha256')
    .update(`${frequency || 'daily'}|${dateKey}|${ids.join('|')}`)
    .digest('hex');
}

function resolveDeliveryPlan(partner, recipientCount) {
  const configuredMode = partner.newsletter_delivery_mode || 'mobiliti';
  if (configuredMode === 'external') return { mode: 'external', fallbackReason: null };
  if (configuredMode === 'export') return { mode: 'export', fallbackReason: null };
  const limit = Number(partner.newsletter_recipient_limit) || DEFAULT_RECIPIENT_LIMIT;
  if (recipientCount > limit) {
    return {
      mode: 'export',
      fallbackReason: `Die ${recipientCount} bestätigten Empfänger überschreiten das Mobiliti-Limit von ${limit}. Es wurde deshalb nur ein Export erzeugt.`,
    };
  }
  return { mode: 'mobiliti', fallbackReason: null };
}

async function claimDelivery(client, { partnerId, userId, email, mode, campaignKey }) {
  const result = await client.query(
    `INSERT INTO newsletter_deliveries
       (business_partner_id, user_id, recipient_email, delivery_type, campaign_key, delivery_mode, status)
     VALUES ($1, $2, $3, 'industry_briefing', $4, $5, 'sending')
     ON CONFLICT (business_partner_id, delivery_type, campaign_key, recipient_email)
     DO UPDATE SET
       status = 'sending', error_message = NULL, failed_at = NULL, created_at = CURRENT_TIMESTAMP
     WHERE newsletter_deliveries.status = 'failed'
        OR (newsletter_deliveries.status = 'sending'
            AND newsletter_deliveries.created_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes')
     RETURNING id`,
    [partnerId, userId || null, normalizeEmail(email), campaignKey, mode]
  );
  return result.rows[0]?.id || null;
}

async function markDelivery(client, id, status, infoOrError) {
  if (!id) return;
  if (status === 'sent') {
    await client.query(
      `UPDATE newsletter_deliveries
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, provider_message_id = $2
       WHERE id = $1`,
      [id, infoOrError?.messageId || null]
    );
    return;
  }
  await client.query(
    `UPDATE newsletter_deliveries
     SET status = 'failed', failed_at = CURRENT_TIMESTAMP, error_message = $2
     WHERE id = $1`,
    [id, String(infoOrError?.message || infoOrError || 'Unbekannter Versandfehler').slice(0, 2000)]
  );
}

function resolveCentralEmail(partner) {
  const preferred = normalizeEmail(partner.newsletter_export_email);
  if (isEmail(preferred)) return preferred;
  const fallback = normalizeEmail(partner.email);
  return isEmail(fallback) ? fallback : null;
}

async function dispatchCentralExport(client, { partner, briefing, nextEvent, campaignKey, fallbackReason }) {
  const recipient = resolveCentralEmail(partner);
  if (!recipient) {
    throw new Error(`Für ${partner.name} fehlt eine gültige zentrale Newsletter-E-Mail-Adresse.`);
  }

  const deliveryId = await claimDelivery(client, {
    partnerId: partner.id,
    email: recipient,
    mode: 'export',
    campaignKey,
  });
  if (!deliveryId) return { mode: 'export', recipientCount: 1, sentCount: 0, skippedCount: 1 };

  const html = renderFleetDailyBriefingEmail({ briefing, partner, nextEvent });
  const subject = `[Export] ${partner.dashboard_title || 'Mobiliti Branchenbriefing'}: ${briefing.top_insights?.[0]?.title || 'Aktuelle Insights'}`;
  const note = fallbackReason
    ? `<p><strong>Hinweis:</strong> ${fallbackReason}</p>`
    : '<p>Dieses fertige Briefing ist für die Weiterverarbeitung im Newsletter-System des Mandanten bestimmt.</p>';
  const exportHtml = html.replace(/<body([^>]*)>/i, `<body$1>${note}`);

  try {
    const info = await sendEmail({
      to: recipient,
      subject,
      html: exportHtml,
      partner,
      attachments: [{
        filename: `mobiliti-branchenbriefing-${new Date().toISOString().slice(0, 10)}.html`,
        content: Buffer.from(html, 'utf8'),
        contentType: 'text/html; charset=utf-8',
      }],
    });
    await markDelivery(client, deliveryId, 'sent', info);
    return { mode: 'export', recipientCount: 1, sentCount: 1, skippedCount: 0 };
  } catch (error) {
    await markDelivery(client, deliveryId, 'failed', error);
    throw error;
  }
}

async function dispatchBriefing({ partner, items, briefing, nextEvent, frequency, now = new Date() }) {
  const client = await db.connect();
  try {
    const configuredMode = partner.newsletter_delivery_mode || 'mobiliti';
    const campaignKey = campaignKeyFor(items, frequency, now);
    const configuredPlan = resolveDeliveryPlan(partner, 0);

    if (configuredPlan.mode === 'external') {
      return {
        mode: 'external',
        recipientCount: 0,
        sentCount: 0,
        skippedCount: 0,
        message: 'Externer Versand konfiguriert; Mobiliti versendet keine Mitglieder-E-Mails.',
      };
    }

    if (configuredPlan.mode === 'export') {
      return dispatchCentralExport(client, { partner, briefing, nextEvent, campaignKey });
    }

    const recipientsResult = await client.query(
      `SELECT id, email, first_name, last_name
       FROM users
       WHERE business_partner_id = $1
         AND is_active = TRUE
         AND newsletter_opt_in = TRUE
         AND briefing_email_enabled = TRUE
         AND email IS NOT NULL
       ORDER BY id`,
      [partner.id]
    );
    const recipients = recipientsResult.rows.filter((user) => isEmail(user.email));
    const effectivePlan = resolveDeliveryPlan(partner, recipients.length);
    if (effectivePlan.mode === 'export') {
      return dispatchCentralExport(client, {
        partner,
        briefing,
        nextEvent,
        campaignKey,
        fallbackReason: effectivePlan.fallbackReason,
      });
    }

    let sentCount = 0;
    let skippedCount = 0;
    const failures = [];
    for (const user of recipients) {
      const deliveryId = await claimDelivery(client, {
        partnerId: partner.id,
        userId: user.id,
        email: user.email,
        mode: configuredMode,
        campaignKey,
      });
      if (!deliveryId) {
        skippedCount += 1;
        continue;
      }
      try {
        const info = await sendDailyBriefing({ to: user.email, user, partner, briefing, nextEvent });
        await markDelivery(client, deliveryId, 'sent', info);
        sentCount += 1;
      } catch (error) {
        await markDelivery(client, deliveryId, 'failed', error);
        failures.push(`${user.email}: ${error.message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} Briefing-Zustellung(en) fehlgeschlagen: ${failures.slice(0, 3).join('; ')}`);
    }
    return { mode: configuredMode, recipientCount: recipients.length, sentCount, skippedCount };
  } finally {
    client.release();
  }
}

module.exports = {
  DEFAULT_RECIPIENT_LIMIT,
  campaignKeyFor,
  resolveDeliveryPlan,
  dispatchBriefing,
};
