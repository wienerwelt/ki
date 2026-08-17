// backend/services/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const {
  renderLayout,
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderNewsletterOptInEmail,
  renderNewOpportunitiesEmail,
  renderFleetDailyBriefingEmail
} = require('./emailTemplates');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT || 587),
  secure: String(process.env.EMAIL_PORT) === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/** Absenderadresse: Nutzt den Mandantennamen als Anzeigenamen, falls vorhanden */
function resolveFrom(fromName) {
  const safeName = fromName || process.env.EMAIL_ADMIN || 'Intelligence Dashboard';
  const user = process.env.EMAIL_USER || 'noreply@example.com';
  return `"${safeName}" <${user}>`;
}

function getBaseUrl() {
  const raw = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
  return raw.replace(/\/+$/, '');
}

function resolveLogoAttachment() {
  const p = (process.env.EMAIL_EMBED_LOGO_PATH || '').trim();
  if (!p) return null;
  try {
    if (fs.existsSync(p)) {
      return {
        filename: path.basename(p),
        path: p,
        cid: 'brand-logo',
      };
    }
  } catch (_) { /* ignore */ }
  return null;
}

/** Niedrig-Level Versand, unterstützt nun partner-Objekt für Reply-To */
async function sendEmail({ to, subject, html, text, fromName, replyTo, partner, attachments = [], headers }) {
  const mailOptions = {
    from: resolveFrom(fromName || partner?.name),
    to,
    subject,
    html,
    text,
    headers,
  };
  
  if (replyTo) {
      mailOptions.replyTo = replyTo;
  } else if (partner?.email) {
      mailOptions.replyTo = partner.email; // Antworten gehen direkt an den Mandanten
  }

  const logoAttachment = resolveLogoAttachment();
  const allAttachments = [...attachments];
  if (logoAttachment && !allAttachments.some((attachment) => attachment.cid === logoAttachment.cid)) {
    allAttachments.push(logoAttachment);
  }
  if (allAttachments.length > 0) {
    mailOptions.attachments = allAttachments;
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`[mail] ✔ gesendet an: ${Array.isArray(to) ? to.join(', ') : to} (Im Namen von: ${partner?.name || fromName || 'System'})`);
  return info;
}

function buildVerifyUrl(token) { return `${getBaseUrl()}/verify-email/${token}`; }
function buildResetUrl(token) { return `${getBaseUrl()}/reset-password/${token}`; }
function buildNewsletterConfirmUrl(token) { return `${getBaseUrl()}/api/auth/newsletter/confirm/${token}`; }
function buildSearchUrl(searchCriteria) {
    const params = new URLSearchParams();
    if (searchCriteria.q) params.append('q', searchCriteria.q);
    if (searchCriteria.regions) params.append('regions', searchCriteria.regions);
    if (searchCriteria.selectedCategories) params.append('categories', searchCriteria.selectedCategories.join(','));
    return `${getBaseUrl()}/funding-search?${params.toString()}`;
}

// --- High-Level Sender Funktionen ---

async function sendNewOpportunitiesNotification({ to, username, searchName, newOpportunities, searchCriteria, partner }) {
    const searchUrl = buildSearchUrl(searchCriteria);
    const html = renderNewOpportunitiesEmail({ username, searchName, newOpportunities, searchUrl, partner });
    const subject = `Neue Förderungen für Ihre Suche: "${searchName}"`;
    await sendEmail({ to, subject, html, partner });
}

async function sendVerificationEmail({ to, username, verifyUrl, partner }) {
  if (!verifyUrl) throw new Error('verifyUrl fehlt für Verifizierungs-Mail.');
  const html = renderVerificationEmail({ username, verifyUrl, partner });
  const subject = partner?.name 
      ? `Bitte E-Mail bestätigen für ${partner.name}` 
      : 'Bitte E-Mail-Adresse bestätigen';

  const text = `Hallo ${username || ''},\n\nBitte bestätige deine E-Mail-Adresse:\n${verifyUrl}`;
  await sendEmail({ to, subject, html, text, partner });
}

async function sendPasswordResetEmail({ to, username, resetUrl, partner }) {
  if (!resetUrl) throw new Error('resetUrl fehlt für Passwort-Reset-Mail.');
  const html = renderPasswordResetEmail({ username, resetUrl, partner });
  const subject = 'Passwort zurücksetzen';
  const text = `Hallo ${username || ''},\n\nDu hast eine Zurücksetzung deines Passworts angefragt:\n${resetUrl}`;
  await sendEmail({ to, subject, html, text, partner });
}

async function sendNewsletterOptInEmail({ to, username, confirmUrl, unsubscribeUrl, partner }) {
  if (!confirmUrl) throw new Error('confirmUrl fehlt für Newsletter-Opt-In-Mail.');
  const html = renderNewsletterOptInEmail({ username, confirmUrl, unsubscribeUrl, partner });
  const subject = 'Bitte Newsletter-Anmeldung bestätigen';
  const text = `Hallo ${username || ''},\n\nBitte bestätige deine Anmeldung:\n${confirmUrl}`;
  await sendEmail({ to, subject, html, text, partner });
}

async function sendCommunityReplyNotification({ to, recipientName, commenterName, postTitle, postLink }) {
    if (!to) return;
    const subject = `Neue Antwort von ${commenterName}`;
    const contentHtml = `
        <p>Hallo ${recipientName || 'Nutzer'},</p>
        <p><strong>${commenterName}</strong> hat auf deinen Beitrag im Mitglieder-Hub geantwortet.</p>
        <div style="border-left: 4px solid #2196f3; padding-left: 15px; margin: 20px 0; background-color: #f9f9f9; padding: 10px; color: #555;">
            <em>"${postTitle}..."</em>
        </div>
        <p>Klicke auf den Button unten, um die Antwort zu lesen und zu reagieren.</p>
    `;

    const html = renderLayout({
        title: 'Neue Antwort',
        preheader: `${commenterName} hat geantwortet`,
        contentHtml: contentHtml,
        ctaLabel: 'Zur Diskussion',
        ctaUrl: postLink,
        footerText: 'Du erhältst diese E-Mail, weil du Mitglied im Mobiliti-Hub bist.'
    });

    await sendEmail({ to, subject, html });
}

// --- KI BRIEFING VERSAND ---
async function sendDailyBriefing({ to, user, partner, briefing, nextEvent, pdfUrl }) {
  const html = renderFleetDailyBriefingEmail({ briefing, partner, nextEvent, pdfUrl });
  const subject = `${partner?.dashboard_title || 'Markt-Briefing'}: ${briefing.top_insights?.[0]?.title || 'Ihre aktuellen Insights'}`;
  return sendEmail({ to, subject, html, partner });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewsletterOptInEmail,
  sendNewOpportunitiesNotification,
  sendCommunityReplyNotification,
  sendDailyBriefing, // Export hinzugefügt
  buildVerifyUrl,
  buildResetUrl,
  buildNewsletterConfirmUrl,
  getBaseUrl,
};
