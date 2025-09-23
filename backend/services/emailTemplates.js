// backend/services/emailTemplates.js

// Zentrales Branding
const BRAND = {
  product: 'KI-Dashboard',
  company: 'Mobiliti',
  supportEmail: 'hello@mobiliti.at',
};

function getBaseUrl() {
  const raw = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
  return raw.replace(/\/+$/, '');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Logo-Referenz bestimmen:
 * - Wenn brandLogoUrl übergeben wurde, wird diese URL genutzt.
 * - Wenn EMAIL_EMBED_LOGO_PATH gesetzt ist, referenzieren Templates das Logo als CID "brand-logo".
 * - sonst als öffentliche URL: <FRONTEND_URL>/logos/de-mobiliti.png
 */
function resolveLogoRef(brandLogoUrl) {
  if (brandLogoUrl) {
    return { type: 'url', url: brandLogoUrl };
  }
  if ((process.env.EMAIL_EMBED_LOGO_PATH || '').trim()) {
    return { type: 'cid', id: 'brand-logo' };
  }
  return { type: 'url', url: `${getBaseUrl()}/logos/de-mobiliti.png` };
}

/**
 * Einfache, robuste Layout-Funktion für alle Mails
 * - brandLogoUrl (optional): absolute oder relative URL eines BP-Logos
 */
function renderLayout({ preheader = '', title = '', contentHtml = '', ctaLabel, ctaUrl, footerText, brandLogoUrl }) {
  const logo = resolveLogoRef(brandLogoUrl);
  const logoImg = logo.type === 'cid'
    ? `<img src="cid:${logo.id}" alt="Logo" width="120" height="auto" style="display:block;border:0;outline:none;text-decoration:none;"/>`
    : `<img src="${logo.url}" alt="Logo" width="120" height="auto" style="display:block;border:0;outline:none;text-decoration:none;"/>`;

  const button = ctaLabel && ctaUrl ? `
    <tr>
      <td align="center" style="padding: 24px 0 0;">
        <a href="${ctaUrl}" target="_blank" rel="noopener"
           style="display:inline-block;padding:12px 20px;text-decoration:none;border-radius:6px;
                  background:#111;color:#fff;font-weight:600;">
          ${escapeHtml(ctaLabel)}
        </a>
      </td>
    </tr>
  ` : '';

  const footer = `
    <p style="color:#6b7280;font-size:12px;line-height:18px;margin:0;">
      © ${new Date().getFullYear()} ${BRAND.company}. Diese E-Mail wurde automatisch versendet.
      Support: <a href="mailto:${BRAND.supportEmail}" style="color:inherit;">${BRAND.supportEmail}</a>
    </p>
    ${footerText ? `<p style="color:#6b7280;font-size:12px;line-height:18px;margin:8px 0 0;">${footerText}</p>` : ''}
  `;

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .card { background: #111 !important; color: #e5e7eb !important; }
      .muted { color: #9ca3af !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <span style="display:none;visibility:hidden;opacity:0;max-height:0;max-width:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;">
          <tr>
            <td align="left" style="padding:0 0 16px;">
              <a href="${getBaseUrl()}" target="_blank" style="text-decoration:none;color:#111;font-weight:700;font-size:18px;display:inline-flex;align-items:center;gap:10px">
                ${logoImg}
                <span>${escapeHtml(BRAND.product)}</span>
              </a>
            </td>
          </tr>
          <tr>
            <td class="card" style="background:#ffffff;border-radius:12px;padding:24px;">
              <h1 style="margin:0 0 8px;font-size:20px;line-height:28px;">${escapeHtml(title)}</h1>
              <div style="font-size:14px;line-height:22px;color:#111;">
                ${contentHtml}
              </div>
              ${button}
            </td>
          </tr>
          <tr><td style="height:16px;"></td></tr>
          <tr>
            <td align="center" class="muted">
              ${footer}
            </td>
          </tr>
          <tr><td style="height:24px;"></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Spezifische Templates ---

function renderShareContentEmail({ senderName, fromName, title, summary, source, brandLogoUrl }) {
  const contentHtml = `
    <p>Hallo,</p>
    <p><strong>${escapeHtml(senderName || '')}</strong> hat folgende Information mit Ihnen geteilt:</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;">
    <h3 style="margin:0 0 8px;">${escapeHtml(title)}</h3>
    <div style="white-space:pre-wrap;">${escapeHtml(summary || '')}</div>
    ${source ? `<p style="margin-top:12px;">Originalquelle: <a href="${source}" target="_blank" rel="noopener">${source}</a></p>` : ''}
  `;
  return renderLayout({
    preheader: title,
    title: fromName || 'KI-Dashboard',
    contentHtml,
    ctaLabel: source ? 'Zur Quelle' : undefined,
    ctaUrl: source || undefined,
    footerText: `Gesendet von ${fromName || 'KI-Dashboard'}.`,
    brandLogoUrl,
  });
}

function renderVerificationEmail({ username, verifyUrl, brandLogoUrl }) {
  const title = 'Bitte E-Mail-Adresse bestätigen';
  const contentHtml = `
    <p>Hallo ${escapeHtml(username || '')},</p>
    <p>bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Button klickst.</p>
    <p>Aus Sicherheitsgründen ist der Link zeitlich begrenzt gültig.</p>
  `;
  return renderLayout({
    preheader: 'E-Mail-Adresse bestätigen',
    title,
    contentHtml,
    ctaLabel: 'E-Mail jetzt bestätigen',
    ctaUrl: verifyUrl,
    brandLogoUrl,
  });
}

function renderPasswordResetEmail({ username, resetUrl, brandLogoUrl }) {
  const title = 'Passwort zurücksetzen';
  const contentHtml = `
    <p>Hallo ${escapeHtml(username || '')},</p>
    <p>du hast eine Zurücksetzung deines Passworts angefordert. Klicke auf den folgenden Button, um ein neues Passwort zu vergeben.</p>
    <p>Der Link ist 1 Stunde gültig. Wenn du dies nicht warst, ignoriere diese E-Mail.</p>
  `;
  return renderLayout({
    preheader: 'Passwort zurücksetzen',
    title,
    contentHtml,
    ctaLabel: 'Passwort zurücksetzen',
    ctaUrl: resetUrl,
    brandLogoUrl,
  });
}

function renderNewsletterOptInEmail({ username, confirmUrl, unsubscribeUrl, brandLogoUrl }) {
  const title = 'Newsletter-Anmeldung bestätigen';
  const contentHtml = `
    <p>Hallo ${escapeHtml(username || '')},</p>
    <p>bitte bestätige deine Anmeldung zum KI-Dashboard Newsletter, indem du auf den folgenden Button klickst.</p>
    <p>So stellst du sicher, dass du unsere Updates nur dann bekommst, wenn du es wirklich möchtest (Double-Opt-In).</p>
    ${unsubscribeUrl ? `<p style="font-size:12px;color:#6b7280;margin-top:12px;">Keine E-Mails mehr gewünscht? Du kannst dich jederzeit <a href="${unsubscribeUrl}" target="_blank" rel="noopener">hier abmelden</a>.</p>` : ''}
  `;
  return renderLayout({
    preheader: 'Newsletter-Anmeldung bestätigen',
    title,
    contentHtml,
    ctaLabel: 'Anmeldung bestätigen',
    ctaUrl: confirmUrl,
    footerText: unsubscribeUrl ? `Abmelden: ${escapeHtml(unsubscribeUrl)}` : undefined,
    brandLogoUrl,
  });
}


function renderNewOpportunitiesEmail({ username, searchName, newOpportunities, searchUrl, brandLogoUrl }) {
  const title = `Neue Förderungen für Ihre Suche: "${escapeHtml(searchName)}"`;
  
  const opportunitiesHtml = newOpportunities.map(opp => 
    `<li style="margin-bottom: 8px;">
       <a href="${getBaseUrl()}/funding-detail/${opp.id}" target="_blank" rel="noopener" style="font-weight: bold; text-decoration: none;">
         ${escapeHtml(opp.title)}
       </a>
     </li>`
  ).join('');

  const contentHtml = `
    <p>Hallo ${escapeHtml(username || '')},</p>
    <p>unser Förder-Assistent hat <strong>${newOpportunities.length} neue relevante Förderung(en)</strong> für Ihre gespeicherte Suche "${escapeHtml(searchName)}" gefunden:</p>
    <ul style="padding-left: 20px;">
      ${opportunitiesHtml}
    </ul>
    <p>Klicken Sie auf den Button unten, um alle Ergebnisse für diese Suche anzuzeigen.</p>
  `;
  
  return renderLayout({
    preheader: `${newOpportunities.length} neue Förderungen gefunden!`,
    title,
    contentHtml,
    ctaLabel: 'Alle Treffer anzeigen',
    ctaUrl: searchUrl,
    brandLogoUrl,
  });
}

module.exports = {
  renderLayout,
  renderShareContentEmail,
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderNewsletterOptInEmail,
  renderNewOpportunitiesEmail,  
};
