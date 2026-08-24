const db = require('../config/db');
const crypto = require('crypto');
const { sendNewsletterOptInEmail } = require('../services/emailService'); // ggf. Pfad anpassen
const { verifyPreferenceToken } = require('../services/newsletterPreferenceService');

function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  return `${local.slice(0, 2)}${local.length > 2 ? '***' : '*'}@${domain}`;
}

async function loadPreferenceUser(token) {
  const userId = verifyPreferenceToken(token);
  const result = await db.query(
    `SELECT id, email, newsletter_opt_in, briefing_email_enabled, member_newsletter_enabled
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

exports.subscribe = async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'E-Mail fehlt' });

    // Token erzeugen, speichern und Opt-In-Mail senden
    const token = crypto.randomBytes(24).toString('hex');
    await db.query(
      `UPDATE users SET newsletter_opt_in = false, briefing_email_enabled = false,
       member_newsletter_enabled = false, newsletter_opt_in_token = $2 WHERE email = $1`,
      [email, token]
    );

    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    const confirmUrl = `${base.replace(/\/$/,'')}/newsletter/confirm/${token}`;

    await sendNewsletterOptInEmail({ to: email, confirmUrl });
    return res.json({ message: 'Bestätigungsmail gesendet' });
  } catch (e) {
    console.error('newsletter.subscribe', e);
    return res.status(500).json({ message: 'Serverfehler' });
  }
};

exports.confirm = async (req, res) => {
  try {
    const { token } = req.params;
    const { rowCount } = await db.query(
      `UPDATE users SET newsletter_opt_in = true, briefing_email_enabled = true,
       member_newsletter_enabled = true, newsletter_opt_in_confirmed_at = CURRENT_TIMESTAMP,
       newsletter_unsubscribed_at = NULL, newsletter_opt_in_token = NULL WHERE newsletter_opt_in_token = $1`,
      [token]
    );
    if (!rowCount) return res.status(400).json({ message: 'Ungültiger oder verbrauchter Token' });
    return res.json({ message: 'Newsletter aktiviert' });
  } catch (e) {
    console.error('newsletter.confirm', e);
    return res.status(500).json({ message: 'Serverfehler' });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'E-Mail fehlt' });

    await db.query(
      `UPDATE users SET newsletter_opt_in = false, briefing_email_enabled = false,
       member_newsletter_enabled = false, newsletter_unsubscribed_at = CURRENT_TIMESTAMP WHERE email = $1`,
      [email]
    );
    return res.json({ message: 'Newsletter abbestellt' });
  } catch (e) {
    console.error('newsletter.unsubscribe', e);
    return res.status(500).json({ message: 'Serverfehler' });
  }
};

exports.getPreferences = async (req, res) => {
  try {
    const user = await loadPreferenceUser(req.params.token);
    if (!user) return res.status(404).json({ message: 'Dieser Link ist nicht mehr gültig.' });
    return res.json({
      email: maskEmail(user.email),
      newsletter_opt_in: user.newsletter_opt_in === true,
      briefing_email_enabled: user.briefing_email_enabled === true,
      member_newsletter_enabled: user.member_newsletter_enabled === true,
    });
  } catch (_error) {
    return res.status(400).json({ message: 'Dieser Link ist ungültig oder abgelaufen.' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const user = await loadPreferenceUser(req.params.token);
    if (!user) return res.status(404).json({ message: 'Dieser Link ist nicht mehr gültig.' });
    const briefing = req.body?.briefing_email_enabled === true;
    const members = req.body?.member_newsletter_enabled === true;
    if ((briefing || members) && user.newsletter_opt_in !== true) {
      return res.status(409).json({ message: 'Für eine erneute Anmeldung ist ein neuer Bestätigungslink erforderlich.' });
    }
    await db.query(
      `UPDATE users SET briefing_email_enabled = $1, member_newsletter_enabled = $2,
       updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [briefing, members, user.id]
    );
    return res.json({ message: 'E-Mail-Einstellungen gespeichert.' });
  } catch (_error) {
    return res.status(400).json({ message: 'Dieser Link ist ungültig oder abgelaufen.' });
  }
};

exports.unsubscribeByToken = async (req, res) => {
  try {
    const user = await loadPreferenceUser(req.params.token);
    if (!user) return res.status(404).json({ message: 'Dieser Link ist nicht mehr gültig.' });
    await db.query(
      `UPDATE users SET newsletter_opt_in = FALSE, briefing_email_enabled = FALSE,
       member_newsletter_enabled = FALSE, newsletter_unsubscribed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );
    return res.json({ message: 'Alle Newsletter wurden abbestellt.' });
  } catch (_error) {
    return res.status(400).json({ message: 'Dieser Link ist ungültig oder abgelaufen.' });
  }
};
