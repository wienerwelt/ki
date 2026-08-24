const db = require('../config/db');
const { sendEmail } = require('../services/emailService');
const { renderMemberNewsletterEmail } = require('../services/emailTemplates');
const {
  normalizeFilter,
  loadPartner,
  getRecipientPreview,
  enqueueCampaign,
} = require('../services/memberNewsletterService');

function authorizedPartnerId(req, res, requestedId) {
  const requested = String(requestedId || '').trim() || null;
  const own = req.user.business_partner_id || null;
  if (req.user.role === 'admin') return requested || own;
  if (!own || (requested && requested !== String(own))) {
    res.status(403).json({ message: 'Zugriff auf einen fremden Mandanten verweigert.' });
    return null;
  }
  return own;
}

function validateCampaign(body = {}) {
  const subject = String(body.subject || '').trim();
  const preheader = String(body.preheader || '').trim();
  const bodyText = String(body.body_text || '').trim();
  const ctaLabel = String(body.cta_label || '').trim();
  const ctaUrl = String(body.cta_url || '').trim();
  if (!subject || subject.length > 200) throw new Error('Betreff ist erforderlich und darf höchstens 200 Zeichen enthalten.');
  if (!bodyText || bodyText.length > 20000) throw new Error('Inhalt ist erforderlich und darf höchstens 20.000 Zeichen enthalten.');
  if (preheader.length > 300 || ctaLabel.length > 80) throw new Error('Vorschautext oder Buttontext ist zu lang.');
  if (ctaUrl) {
    const parsed = new URL(ctaUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Die Button-URL muss mit http:// oder https:// beginnen.');
  }
  if (ctaLabel && !ctaUrl) throw new Error('Zum Buttontext fehlt die Button-URL.');
  return { subject, preheader, body_text: bodyText, cta_label: ctaLabel, cta_url: ctaUrl };
}

exports.previewRecipients = async (req, res) => {
  const partnerId = authorizedPartnerId(req, res, req.query.bpId);
  if (!partnerId) return;
  try {
    const preview = await getRecipientPreview(partnerId, {
      membership_level: req.query.membershipLevel,
      expires_within_days: req.query.expiresWithinDays,
    });
    const partner = await loadPartner(partnerId);
    if (!partner) return res.status(404).json({ message: 'Mandant nicht gefunden.' });
    const limit = Number(partner.newsletter_recipient_limit || 250);
    const configuredMode = partner.newsletter_delivery_mode || 'mobiliti';
    const effectiveMode = configuredMode === 'mobiliti' && preview.eligible_count > limit ? 'export' : configuredMode;
    return res.json({
      ...preview,
      configured_mode: configuredMode,
      effective_mode: effectiveMode,
      direct_limit: limit,
      signature: {
        name: partner.dashboard_title || partner.name,
        organization: partner.name,
        address: partner.address || null,
        email: partner.email || null,
        url: partner.url_businesspartner || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Empfängervorschau konnte nicht geladen werden.' });
  }
};

exports.history = async (req, res) => {
  const partnerId = authorizedPartnerId(req, res, req.query.bpId);
  if (!partnerId) return;
  const result = await db.query(
    `SELECT id, subject, status, recipient_count, sent_count, skipped_count, failed_count,
     delivery_mode, error_message, created_at, sent_at
     FROM member_newsletter_campaigns WHERE business_partner_id = $1
     ORDER BY created_at DESC LIMIT 30`,
    [partnerId]
  );
  return res.json(result.rows);
};

exports.sendTest = async (req, res) => {
  const partnerId = authorizedPartnerId(req, res, req.body.bpId);
  if (!partnerId) return;
  try {
    const campaign = validateCampaign(req.body);
    const partner = await loadPartner(partnerId);
    if (!partner) return res.status(404).json({ message: 'Mandant nicht gefunden.' });
    await sendEmail({
      to: req.user.email,
      subject: `[TEST] ${campaign.subject}`,
      html: renderMemberNewsletterEmail({ campaign, partner, user: req.user, isTest: true }),
      partner,
    });
    return res.json({ message: `Testmail wurde an ${req.user.email} gesendet.` });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Testmail konnte nicht gesendet werden.' });
  }
};

exports.enqueue = async (req, res) => {
  const partnerId = authorizedPartnerId(req, res, req.body.bpId);
  if (!partnerId) return;
  try {
    const campaign = validateCampaign(req.body);
    const filter = normalizeFilter(req.body.recipient_filter);
    const partner = await loadPartner(partnerId);
    if (!partner) return res.status(404).json({ message: 'Mandant nicht gefunden.' });
    const preview = await getRecipientPreview(partnerId, filter);
    if (preview.eligible_count < 1) return res.status(400).json({ message: 'Keine berechtigten, aktiven Empfänger gefunden.' });
    const inserted = await db.query(
      `INSERT INTO member_newsletter_campaigns
       (business_partner_id, created_by, subject, preheader, body_text, cta_label, cta_url,
        recipient_filter, recipient_count, delivery_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING id, status, created_at`,
      [partnerId, req.user.id, campaign.subject, campaign.preheader || null, campaign.body_text,
        campaign.cta_label || null, campaign.cta_url || null, JSON.stringify(filter),
        preview.eligible_count, partner.newsletter_delivery_mode || 'mobiliti']
    );
    await enqueueCampaign(inserted.rows[0].id);
    return res.status(202).json({
      ...inserted.rows[0],
      recipient_count: preview.eligible_count,
      message: 'Mitglieder-Mail wurde sicher in die Versandwarteschlange gestellt.',
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Mitglieder-Mail konnte nicht eingeplant werden.' });
  }
};

exports.validateCampaign = validateCampaign;
