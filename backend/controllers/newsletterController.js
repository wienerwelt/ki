const db = require('../config/db');
const crypto = require('crypto');
const { sendNewsletterOptInEmail } = require('../services/emailService'); // ggf. Pfad anpassen

exports.subscribe = async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'E-Mail fehlt' });

    // Token erzeugen, speichern und Opt-In-Mail senden
    const token = crypto.randomBytes(24).toString('hex');
    await db.query(
      `UPDATE users SET newsletter_opt_in = false, newsletter_opt_in_token = $2 WHERE email = $1`,
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
      `UPDATE users SET newsletter_opt_in = true, newsletter_opt_in_token = NULL WHERE newsletter_opt_in_token = $1`,
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
      `UPDATE users SET newsletter_opt_in = false WHERE email = $1`,
      [email]
    );
    return res.json({ message: 'Newsletter abbestellt' });
  } catch (e) {
    console.error('newsletter.unsubscribe', e);
    return res.status(500).json({ message: 'Serverfehler' });
  }
};
