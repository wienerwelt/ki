// backend/services/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const {
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderNewsletterOptInEmail,
  renderNewOpportunitiesEmail,
} = require('./emailTemplates');

/**
 * Transporter (Strato SMTP, STARTTLS auf 587)
 *
 * ENV:
 *  EMAIL_HOST=smtp.strato.de
 *  EMAIL_PORT=587
 *  EMAIL_USER=sp@mobiliti.at
 *  EMAIL_PASS=xxx
 *  EMAIL_ADMIN="Admin Dashboard <hello@mobiliti.at>"   (optional)
 *  FRONTEND_URL=https://dashboard.mobiliti.at         (für Links/Logo-URL)
 *  EMAIL_EMBED_LOGO_PATH=/abs/weg/zum/logo.png        (optional: Logo als CID einbetten)
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT || 587),
  secure: String(process.env.EMAIL_PORT) === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // tls: { rejectUnauthorized: true },
});

/** Absenderadresse zusammenbauen */
function resolveFrom(fromName = 'KI-Dashboard') {
  const admin = (process.env.EMAIL_ADMIN || '').trim();
  if (admin) return admin; // vollständiger "Name <mail@…>"-String
  const user = process.env.EMAIL_USER || 'noreply@example.com';
  return `"${fromName}" <${user}>`;
}

/** Basis-URL ohne abschließenden Slash */
function getBaseUrl() {
  const raw = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
  return raw.replace(/\/+$/, '');
}

/** Wenn EMAIL_EMBED_LOGO_PATH gesetzt & Datei vorhanden → als CID anhängen */
function resolveLogoAttachment() {
  const p = (process.env.EMAIL_EMBED_LOGO_PATH || '').trim();
  if (!p) return null;
  try {
    if (fs.existsSync(p)) {
      return {
        filename: path.basename(p),
        path: p,
        cid: 'brand-logo', // muss zum Template-CID passen
      };
    }
  } catch (_) { /* ignore */ }
  return null;
}

/** Niedrig-Level Versand */
async function sendEmail({ to, subject, html, text, fromName = 'KI-Dashboard', replyTo }) {
  const mailOptions = {
    from: resolveFrom(fromName),
    to,
    subject,
    html,
    text,
  };
  if (replyTo) mailOptions.replyTo = replyTo;

  // Logo (optional) als CID anhängen
  const logoAttachment = resolveLogoAttachment();
  if (logoAttachment) {
    mailOptions.attachments = [logoAttachment];
  }

  await transporter.sendMail(mailOptions);
  console.log(`[mail] ✔ gesendet an: ${Array.isArray(to) ? to.join(', ') : to}`);
}

/** URL-Helper (optional im Controller nutzbar) */
function buildVerifyUrl(token) {
  return `${getBaseUrl()}/verify-email/${token}`;
}
function buildResetUrl(token) {
  return `${getBaseUrl()}/reset-password/${token}`;
}
function buildNewsletterConfirmUrl(token) {
  return `${getBaseUrl()}/newsletter/confirm/${token}`;
}

function buildSearchUrl(searchCriteria) {
    const params = new URLSearchParams();
    if (searchCriteria.q) params.append('q', searchCriteria.q);
    if (searchCriteria.regions) params.append('regions', searchCriteria.regions);
    if (searchCriteria.selectedCategories) params.append('categories', searchCriteria.selectedCategories.join(','));
    // ... weitere Parameter nach Bedarf
    return `${getBaseUrl()}/funding-search?${params.toString()}`;
}


// NEUE High-Level Funktion einfügen
async function sendNewOpportunitiesNotification({ to, username, searchName, newOpportunities, searchCriteria }) {
    const searchUrl = buildSearchUrl(searchCriteria);
    const html = renderNewOpportunitiesEmail({ username, searchName, newOpportunities, searchUrl });
    const subject = `Neue Förderungen für Ihre Suche: "${searchName}"`;
    await sendEmail({ to, subject, html });
}

/** High-Level Sender */

async function sendVerificationEmail({ to, username, verifyUrl }) {
  if (!verifyUrl) throw new Error('verifyUrl fehlt für Verifizierungs-Mail.');
  const html = renderVerificationEmail({ username, verifyUrl });
  const subject = 'Bitte E-Mail-Adresse bestätigen';
  const text = `Hallo ${username || ''},

Bitte bestätige deine E-Mail-Adresse:
${verifyUrl}

Wenn du dich nicht registriert hast, ignoriere diese E-Mail.`;
  await sendEmail({ to, subject, html, text });
}

async function sendPasswordResetEmail({ to, username, resetUrl }) {
  if (!resetUrl) throw new Error('resetUrl fehlt für Passwort-Reset-Mail.');
  const html = renderPasswordResetEmail({ username, resetUrl });
  const subject = 'Passwort zurücksetzen';
  const text = `Hallo ${username || ''},

Du hast eine Zurücksetzung deines Passworts angefragt:
${resetUrl}

Wenn du dies nicht warst, ignoriere diese E-Mail.`;
  await sendEmail({ to, subject, html, text });
}

async function sendNewsletterOptInEmail({ to, username, confirmUrl, unsubscribeUrl }) {
  if (!confirmUrl) throw new Error('confirmUrl fehlt für Newsletter-Opt-In-Mail.');
  const html = renderNewsletterOptInEmail({ username, confirmUrl, unsubscribeUrl });
  const subject = 'Bitte Newsletter-Anmeldung bestätigen';
  const text = `Hallo ${username || ''},

Bitte bestätige deine Anmeldung zum KI-Dashboard Newsletter:
${confirmUrl}

${unsubscribeUrl ? `Wenn du keine E-Mails mehr erhalten möchtest, kannst du dich hier abmelden: ${unsubscribeUrl}` : ''}`;
  await sendEmail({ to, subject, html, text });
}

module.exports = {
  // Low-level
  sendEmail,
  // Business-Mails
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewsletterOptInEmail,
  sendNewOpportunitiesNotification,
  // URL-Builder
  buildVerifyUrl,
  buildResetUrl,
  buildNewsletterConfirmUrl,
  // ggf. exportiere getBaseUrl, falls du es im Controller brauchst
  getBaseUrl,
};
