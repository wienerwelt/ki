// backend/services/emailTemplates.js

const BRAND = {
  product: 'KI-Dashboard', // Fallback-Titel
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


function renderLayout({ 
  preheader = '', 
  title = '', 
  contentHtml = '', 
  ctaLabel, 
  ctaUrl, 
  footerText, 
  brandLogoUrl, 
  dashboardTitle,
  colors = {}
}) {
  const logo = resolveLogoRef(brandLogoUrl);
  const primaryColor = colors.primary_color || '#111827';
  const primaryText = colors.primary_text_color || '#ffffff';
  const logoImg = logo.type === 'cid'
    ? `<img src="cid:${logo.id}" alt="Logo" height="40" style="display:block;max-height:40px;"/>`
    : `<img src="${logo.url}" alt="Logo" height="40" style="display:block;max-height:40px;"/>`;

  const button = (ctaLabel && ctaUrl) ? `
    <tr>
      <td align="center" style="padding: 24px 0 0;">
        <a href="${ctaUrl}" target="_blank" rel="noopener"
           style="display:inline-block;padding:14px 24px;text-decoration:none;border-radius:8px;
                  background-color:${primaryColor};color:${primaryText};font-weight:600;font-size:16px;">
          ${escapeHtml(ctaLabel)}
        </a>
      </td>
    </tr>
  ` : '';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .content-block h2 { color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}20; padding-bottom: 5px; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr style="background-color:#ffffff;">
            <td style="padding:24px; border-bottom: 1px solid #f3f4f6;">
              <table width="100%"><tr>
                <td align="left">${logoImg}</td>
                <td align="right" style="font-weight:bold; font-size:14px; color:#6b7280;">${escapeHtml(dashboardTitle || 'Intelligence')}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;" class="content-block">
              <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">${escapeHtml(title)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#374151;">
                ${contentHtml}
              </div>
              ${button}
            </td>
          </tr>
        </table>
        <table style="max-width:600px;" width="100%">
          <tr><td style="padding:24px;text-align:center;font-size:12px;color:#9ca3af;">
            ${footerText || ''}<br>© ${new Date().getFullYear()} Mobiliti
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}


function renderShareContentEmail({ senderName, fromName, title, summary, source, brandLogoUrl, dashboardTitle }) {
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
    dashboardTitle, // Weitergeleitet
  });
}

function renderVerificationEmail({ username, verifyUrl, brandLogoUrl, dashboardTitle }) {
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
    dashboardTitle, // Weitergeleitet
  });
}

function renderPasswordResetEmail({ username, resetUrl, brandLogoUrl, dashboardTitle }) {
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
    dashboardTitle, // Weitergeleitet
  });
}

function renderNewsletterOptInEmail({ username, confirmUrl, unsubscribeUrl, brandLogoUrl, dashboardTitle }) {
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
    dashboardTitle, // Weitergeleitet
  });
}


function renderNewOpportunitiesEmail({ username, searchName, newOpportunities, searchUrl, brandLogoUrl, dashboardTitle }) {
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
    dashboardTitle, // Weitergeleitet
  });
}

// ANGEPASST: Akzeptiert jetzt `nextEvent`
function renderBriefingEmail({ briefing, brandLogoUrl, dashboardTitle, nextEvent }) {
  const title = `Ihr Tägliches Briefing für den ${new Date().toLocaleDateString('de-DE')}`;
  
  let contentHtml = '';
  if (briefing.market_briefing) {
    const mb = briefing.market_briefing;
    contentHtml += `
      <h2 style="font-size: 18px; margin-top: 0; padding-bottom: 5px; border-bottom: 1px solid #eee;">Markt-Briefing</h2>
      <h3 style="font-size: 16px; margin-top: 15px; margin-bottom: 5px;">${escapeHtml(mb.headline)}</h3>
      <p>${escapeHtml(mb.summary)}</p>
      <p><strong>Prognose:</strong> <em>${escapeHtml(mb.prognosis)}</em></p>
    `;
  }

  if (briefing.sales_triggers && briefing.sales_triggers.length > 0) {
    contentHtml += `<hr style="border:none; border-top:1px solid #eee; margin: 25px 0;" />
                    <h2 style="font-size: 18px; margin-top: 0; padding-bottom: 5px; border-bottom: 1px solid #eee;">Ihre Top-Gesprächsanlässe</h2>`;
    briefing.sales_triggers.forEach(st => {
      contentHtml += `
        <div style="margin-top: 15px;">
            <h4 style="margin:0 0 5px;">${escapeHtml(st.headline)}</h4>
            <p style="margin:0 0 5px;"><strong>Analyse:</strong> ${escapeHtml(st.analysis)}</p>
            <p style="margin:0; font-style:italic;"><strong>Gesprächsansatz:</strong> "${escapeHtml(st.talking_point)}"</p>
        </div>
      `;
    });
  }
  
  // NEU: Nächstes Event am Ende hinzufügen
  if (nextEvent && nextEvent.title) {
    const eventDate = new Date(nextEvent.event_date).toLocaleDateString('de-DE');
    contentHtml += `
        <hr style="border:none; border-top:1px solid #eee; margin: 25px 0;" />
        <h2 style="font-size: 18px; margin-top: 0; padding-bottom: 5px; border-bottom: 1px solid #eee;">Nächstes Branchen-Event</h2>
        <div style="margin-top: 15px;">
            <p style="margin:0 0 5px; font-size: 15px;"><strong>${escapeHtml(nextEvent.title)}</strong></p>
            <p style="margin:0 0 12px; color: #333;">Datum: ${eventDate}</p>
            <a href="${nextEvent.original_url}" target="_blank" rel="noopener"
               style="display:inline-block;padding:8px 16px;text-decoration:none;border-radius:6px;
                      background:#f4f4f5;color:#111;font-weight:600;font-size:14px;">
              Details & Anmeldung
            </a>
        </div>
    `;
  }

  return renderLayout({
    preheader: briefing.market_briefing?.headline || 'Ihr tägliches Briefing',
    title,
    contentHtml,
    ctaLabel: 'Zum Dashboard',
    ctaUrl: getBaseUrl(),
    brandLogoUrl,
    dashboardTitle, // Weitergeleitet
  });
}


// backend/services/emailTemplates.js
// ... (dein bestehender Code bleibt) ...

function renderFleetDailyBriefingEmail({ briefing, brandLogoUrl, dashboardTitle, nextEvent, pdfUrl }) {
  const today = new Date().toLocaleDateString('de-DE');
  const title = `Fuhrpark Daily – ${today}`;

  const top3 = (briefing.top_insights || []).slice(0, 3).map((x, idx) => `
    <div style="margin:14px 0;padding:12px;border:1px solid #eee;border-radius:10px;">
      <p style="margin:0 0 6px;font-weight:700;">${idx + 1}. ${escapeHtml(x.title || '')}</p>
      <p style="margin:0 0 6px;"><strong>Was neu ist:</strong> ${escapeHtml(x.what_changed || '')}</p>
      <p style="margin:0 0 6px;"><strong>Warum es zählt:</strong> ${escapeHtml(x.so_what || '')}</p>
      <p style="margin:0;"><strong>Heute tun:</strong> ${escapeHtml(x.action || '')}</p>
      ${
        Array.isArray(x.sources) && x.sources.length
          ? `<p style="margin:10px 0 0;font-size:12px;color:#6b7280;">
              Quellen: ${x.sources.slice(0, 3).map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join(' • ')}
            </p>`
          : ''
      }
    </div>
  `).join('');

  const costRows = (briefing.cost_drivers || []).slice(0, 4).map(d => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;"><strong>${escapeHtml(d.driver || '')}</strong></td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(d.value || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(d.trend || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(d.impact || '')}</td>
    </tr>
  `).join('');

  const regulation = (briefing.regulation_and_funding || []).slice(0, 2).map(r => `
    <div style="margin:10px 0;padding:12px;border:1px solid #eee;border-radius:10px;">
      <p style="margin:0 0 6px;font-weight:700;">${escapeHtml(r.title || '')}</p>
      ${r.deadline ? `<p style="margin:0 0 6px;"><strong>Deadline:</strong> ${escapeHtml(r.deadline)}</p>` : ''}
      <p style="margin:0 0 6px;">${escapeHtml(r.summary || '')}</p>
      <p style="margin:0 0 6px;"><strong>Empfehlung:</strong> ${escapeHtml(r.action || '')}</p>
      ${r.source ? `<p style="margin:0;font-size:12px;color:#6b7280;">Quelle: <a href="${r.source}" target="_blank" rel="noopener">${r.source}</a></p>` : ''}
    </div>
  `).join('');

  const radar = (briefing.industry_radar || []).slice(0, 3).map(n => `
    <li style="margin:0 0 10px;">
      <div style="font-weight:700;">${escapeHtml(n.title || '')}</div>
      <div style="margin-top:4px;">${escapeHtml(n.summary || '')}</div>
      <div style="margin-top:4px;font-size:12px;color:#6b7280;">
        ${n.published_date ? `Datum: ${escapeHtml(n.published_date)} • ` : ''}
        ${n.source ? `Quelle: <a href="${n.source}" target="_blank" rel="noopener">${n.source}</a>` : ''}
      </div>
    </li>
  `).join('');

  const actions = (briefing.recommended_actions || []).slice(0, 3).map(a => `<li>${escapeHtml(a)}</li>`).join('');

  const eventBlock = (nextEvent && nextEvent.title) ? (() => {
    const eventDate = new Date(nextEvent.event_date).toLocaleDateString('de-DE');
    return `
      <h2 style="font-size: 16px; margin-top: 20px; padding-bottom: 5px; border-bottom: 1px solid #eee;">Nächstes Event</h2>
      <p style="margin:10px 0 6px;"><strong>${escapeHtml(nextEvent.title)}</strong></p>
      <p style="margin:0 0 10px;color:#333;">Datum: ${eventDate}</p>
      ${nextEvent.original_url ? `<a href="${nextEvent.original_url}" target="_blank" rel="noopener"
        style="display:inline-block;padding:8px 16px;text-decoration:none;border-radius:6px;background:#f4f4f5;color:#111;font-weight:600;font-size:14px;">
        Details & Anmeldung
      </a>` : ''}
    `;
  })() : '';

  const pdfBlock = pdfUrl ? `
    <div style="margin-top: 16px; padding: 12px; border: 1px dashed #e5e7eb; border-radius: 10px;">
      <strong>PDF-Version:</strong>
      <a href="${pdfUrl}" target="_blank" rel="noopener">Fuhrpark Daily als PDF herunterladen</a>
    </div>
  ` : '';

  const contentHtml = `
    <p style="margin:0 0 12px;color:#6b7280;">Heute in 60 Sekunden. Relevanz vor Vollständigkeit.</p>

    <h2 style="font-size: 16px; margin-top: 0; padding-bottom: 5px; border-bottom: 1px solid #eee;">Top 3 Insights</h2>
    ${top3 || '<p style="color:#6b7280;">Heute keine belastbaren Insights aus den Rohdaten.</p>'}

    <h2 style="font-size: 16px; margin-top: 20px; padding-bottom: 5px; border-bottom: 1px solid #eee;">Kosten & Markt (TCO-Treiber)</h2>
    <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #eee;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th align="left" style="padding:8px;">Driver</th>
          <th align="left" style="padding:8px;">Wert</th>
          <th align="left" style="padding:8px;">Trend</th>
          <th align="left" style="padding:8px;">Impact</th>
        </tr>
      </thead>
      <tbody>
        ${costRows || `<tr><td colspan="4" style="padding:10px;color:#6b7280;">Keine Kostentreiber-Daten verfügbar.</td></tr>`}
      </tbody>
    </table>

    ${regulation ? `
      <h2 style="font-size: 16px; margin-top: 20px; padding-bottom: 5px; border-bottom: 1px solid #eee;">Regulatorik & Förderung</h2>
      ${regulation}
    ` : ''}

    <h2 style="font-size: 16px; margin-top: 20px; padding-bottom: 5px; border-bottom: 1px solid #eee;">Branchen-Radar</h2>
    <ul style="padding-left:18px;margin:10px 0;">
      ${radar || '<li style="color:#6b7280;">Keine Radar-Einträge.</li>'}
    </ul>

    ${eventBlock}

    <h2 style="font-size: 16px; margin-top: 20px; padding-bottom: 5px; border-bottom: 1px solid #eee;">Heute empfohlen</h2>
    <ul style="padding-left:18px;margin:10px 0;">
      ${actions || '<li style="color:#6b7280;">Keine Empfehlungen.</li>'}
    </ul>

    ${pdfBlock}

    ${briefing.confidence_note ? `<p style="margin:16px 0 0;color:#6b7280;font-size:12px;">${escapeHtml(briefing.confidence_note)}</p>` : ''}
  `;

  return renderLayout({
    preheader: (briefing.top_insights && briefing.top_insights[0] && briefing.top_insights[0].title) ? briefing.top_insights[0].title : 'Fuhrpark Daily – Top 3 + Aktionen',
    title,
    contentHtml,
    ctaLabel: 'Zum Dashboard',
    ctaUrl: getBaseUrl(),
    brandLogoUrl,
    dashboardTitle
  });
}

module.exports = {
  renderLayout,
  renderShareContentEmail,
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderNewsletterOptInEmail,
  renderNewOpportunitiesEmail,
  renderBriefingEmail,
  renderFleetDailyBriefingEmail,
};