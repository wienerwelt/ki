// backend/services/emailTemplates.js

function getBaseUrl() {
  const raw = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
  return raw.replace(/\/+$/, '');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// NEU: Stellt sicher, dass Links im Postfach nicht kaputt sind
function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${getBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function resolveLogoRef(logoUrl) {
  if (logoUrl) return { type: 'url', url: toAbsoluteUrl(logoUrl) };
  if ((process.env.EMAIL_EMBED_LOGO_PATH || '').trim()) return { type: 'cid', id: 'brand-logo' };
  
  // Fallback: E-Mail-Clients blockieren SVGs. Wir nutzen ein sicheres PNG.
  return { type: 'url', url: `${getBaseUrl()}/logos/de-mobiliti.png` }; 
}

// Zentrales Layout (Abwärtskompatibel mit alten Aufrufen und neuem partner-Objekt)
function renderLayout({ 
  preheader = '', 
  title = '', 
  contentHtml = '', 
  ctaLabel, 
  ctaUrl, 
  footerText,
  partner = {}, 
  brandLogoUrl, 
  dashboardTitle,
  colors = {} 
}) {
  const logoUrlToUse = partner?.logo_url || brandLogoUrl;
  const logo = resolveLogoRef(logoUrlToUse);
  
  const primaryColor = partner?.color_scheme?.primary_color || colors.primary_color || '#1e293b'; 
  const primaryText = partner?.color_scheme?.primary_text_color || colors.primary_text_color || '#ffffff';
  
  const partnerName = partner?.name || 'Intelligence Dashboard';
  const finalDashboardTitle = partner?.dashboard_title || dashboardTitle || partnerName;
  const partnerEmail = partner?.email || '';
  const partnerAddress = partner?.address || '';
  const partnerUrl = partner?.url_businesspartner || '';

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

  // Dynamischer Footer
  let footerHtml = footerText ? `${footerText}<br><br>` : '';
  if (partner?.name) {
    const footerDetails = [
        partnerName,
        partnerAddress,
        partnerEmail ? `<a href="mailto:${partnerEmail}" style="color:#9ca3af;">${partnerEmail}</a>` : '',
        partnerUrl ? `<a href="${partnerUrl}" target="_blank" style="color:#9ca3af;">${partnerUrl}</a>` : ''
    ].filter(Boolean).join(' • ');
    footerHtml += `<strong>${escapeHtml(partnerName)}</strong><br>${footerDetails}<br><br>© ${new Date().getFullYear()} ${escapeHtml(partnerName)}. Alle Rechte vorbehalten.`;
  } else {
    footerHtml += `© ${new Date().getFullYear()} Mobiliti`;
  }

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .content-block h2 { color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}20; padding-bottom: 5px; }
    a { color: ${primaryColor}; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;">
  <span style="display:none;font-size:1px;color:#f4f6f8;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:24px 10px;">
        <table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <tr style="background-color:#ffffff;">
            <td style="padding:24px; border-bottom: 1px solid #f3f4f6;">
              <table width="100%"><tr>
                <td align="left">${logoImg}</td>
                <td align="right" style="font-weight:bold; font-size:14px; color:#6b7280;">${escapeHtml(finalDashboardTitle)}</td>
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
          <tr>
            <td style="padding:24px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.5;">
              ${footerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- BESTEHENDE SYSTEM-MAILS ---

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
    dashboardTitle,
  });
}

function renderVerificationEmail({ username, verifyUrl, partner }) {
  const contentHtml = `
    <p>Hallo ${escapeHtml(username || '')},</p>
    <p>bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Button klickst.</p>
    <p>Aus Sicherheitsgründen ist der Link zeitlich begrenzt gültig.</p>
  `;
  return renderLayout({
    preheader: 'E-Mail-Adresse bestätigen',
    title: 'Bitte E-Mail-Adresse bestätigen',
    contentHtml,
    ctaLabel: 'E-Mail jetzt bestätigen',
    ctaUrl: verifyUrl,
    partner
  });
}

function renderPasswordResetEmail({ username, resetUrl, partner }) {
  const contentHtml = `
    <p>Hallo ${escapeHtml(username || '')},</p>
    <p>du hast eine Zurücksetzung deines Passworts angefordert. Klicke auf den folgenden Button, um ein neues Passwort zu vergeben.</p>
    <p>Der Link ist 1 Stunde gültig. Wenn du dies nicht warst, ignoriere diese E-Mail.</p>
  `;
  return renderLayout({
    preheader: 'Passwort zurücksetzen',
    title: 'Passwort zurücksetzen',
    contentHtml,
    ctaLabel: 'Passwort zurücksetzen',
    ctaUrl: resetUrl,
    partner
  });
}

function renderNewsletterOptInEmail({ username, confirmUrl, unsubscribeUrl, partner }) {
  const contentHtml = `
    <p>Hallo ${escapeHtml(username || '')},</p>
    <p>bitte bestätige deine Anmeldung zum Newsletter, indem du auf den folgenden Button klickst.</p>
    <p>So stellst du sicher, dass du unsere Updates nur dann bekommst, wenn du es wirklich möchtest (Double-Opt-In).</p>
    ${unsubscribeUrl ? `<p style="font-size:12px;color:#6b7280;margin-top:12px;">Keine E-Mails mehr gewünscht? Du kannst dich jederzeit <a href="${unsubscribeUrl}" target="_blank" rel="noopener">hier abmelden</a>.</p>` : ''}
  `;
  return renderLayout({
    preheader: 'Newsletter-Anmeldung bestätigen',
    title: 'Newsletter-Anmeldung bestätigen',
    contentHtml,
    ctaLabel: 'Anmeldung bestätigen',
    ctaUrl: confirmUrl,
    footerText: unsubscribeUrl ? `Abmelden: ${escapeHtml(unsubscribeUrl)}` : undefined,
    partner
  });
}

function renderNewOpportunitiesEmail({ username, searchName, newOpportunities, searchUrl, partner }) {
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
    partner
  });
}

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
    dashboardTitle
  });
}

// --- HILFSFUNKTION FÜR SAUBERE DOMAINS ---
function getDomain(urlStr) {
  if (!urlStr) return 'Link';
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch (e) {
    return 'Quelle'; // Fallback, falls es kein valider Link ist
  }
}

// --- DAS NEUE KI BRIEFING ---
function renderFleetDailyBriefingEmail({ briefing, partner, nextEvent, pdfUrl }) {
  const today = new Date().toLocaleDateString('de-DE');
  const title = `${partner?.dashboard_title || 'Tages-Briefing'} – ${today}`;
  const primaryColor = partner?.color_scheme?.primary_color || '#1e293b';

  // --- RENDERING: TOP INSIGHTS ---
  const top3 = (briefing.top_insights || []).slice(0, 3).map((x, idx) => {
    // Sichere Quellen-Generierung mit echter Domain
    let sourcesHtml = '';
    if (Array.isArray(x.sources) && x.sources.length > 0) {
      const cleanSources = x.sources.filter(url => typeof url === 'string' && url.trim().startsWith('http'));
      if (cleanSources.length > 0) {
        sourcesHtml = `
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 13px;">
            <strong style="color: #64748b;">Quelle(n):</strong><br/>
            ${cleanSources.map(u => {
              const url = u.trim();
              const domain = getDomain(url);
              return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color: ${primaryColor}; text-decoration: none; font-weight: 500;">
                ${escapeHtml(domain)}
              </a>`;
            }).join(' &nbsp;|&nbsp; ')}
          </div>
        `;
      }
    }

    return `
    <div style="margin:16px 0;padding:16px;background-color:#f8fafc;border-left:4px solid ${primaryColor};border-radius:0 8px 8px 0;">
      <p style="margin:0 0 8px;font-weight:700;font-size:16px;color:#0f172a;">${idx + 1}. ${escapeHtml(x.title || '')}</p>
      <p style="margin:0 0 6px;"><strong>Analyse:</strong> ${escapeHtml(x.what_changed || '')}</p>
      <p style="margin:0 0 6px;"><strong>Bedeutung:</strong> ${escapeHtml(x.so_what || '')}</p>
      <p style="margin:0;"><strong>Empfehlung:</strong> ${escapeHtml(x.action || '')}</p>
      ${sourcesHtml}
    </div>
  `;
  }).join('');

  const topInsightsHtml = top3 || '<p style="color:#6b7280;">Heute keine relevanten Verschiebungen.</p>';

  // --- RENDERING: NÄCHSTES EVENT ---
  let eventHtml = '';
  if (nextEvent && nextEvent.title) {
      const eventDate = nextEvent.event_date ? new Date(nextEvent.event_date).toLocaleDateString('de-DE') : 'Demnächst';
      
      let eventDetailsHtml = '';
      if (typeof nextEvent.original_url === 'string' && nextEvent.original_url.trim().startsWith('http')) {
        eventDetailsHtml = `
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 13px;">
            <a href="${escapeHtml(nextEvent.original_url.trim())}" target="_blank" rel="noopener" style="color: ${primaryColor}; text-decoration: none; font-weight: bold;">
              Details & Anmeldung &rarr;
            </a>
          </div>
        `;
      }

      eventHtml = `
        <h2 style="font-size: 18px; margin-top: 32px;">Nächstes Branchen-Event</h2>
        <div style="margin:16px 0;padding:16px;background-color:#ffffff;border:1px solid #e2e8f0;border-left:4px solid ${primaryColor};border-radius:8px;">
            <p style="margin:0 0 6px;font-weight:700;font-size:16px;color:#0f172a;">📅 ${escapeHtml(nextEvent.title)}</p>
            <p style="margin:0 0 8px;color:${primaryColor};font-size:14px;"><strong>Datum:</strong> ${escapeHtml(eventDate)}</p>
            ${nextEvent.summary ? `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.4;">${escapeHtml(nextEvent.summary)}</p>` : ''}
            ${eventDetailsHtml}
        </div>
      `;
  }

  // --- RENDERING: REGULATORIK & FÖRDERUNG ---
  let regulationHtml = '';
  if (Array.isArray(briefing.regulation_and_funding) && briefing.regulation_and_funding.length > 0) {
      const regulation = briefing.regulation_and_funding.map(r => {
        let sourceHtml = '';
        if (typeof r.source === 'string' && r.source.trim().startsWith('http')) {
          const url = r.source.trim();
          const domain = getDomain(url);
          sourceHtml = `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 13px;">
              <strong style="color: #64748b;">Quelle:</strong> 
              <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color: ${primaryColor}; text-decoration: none; font-weight: 500;">
                ${escapeHtml(domain)}
              </a>
            </div>
          `;
        }

        return `
        <div style="margin:12px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
          <p style="margin:0 0 6px;font-weight:700;">${escapeHtml(r.title || '')}</p>
          ${r.deadline ? `<p style="margin:0 0 6px;color:#ef4444;font-size:14px;"><strong>Frist:</strong> ${escapeHtml(r.deadline)}</p>` : ''}
          <p style="margin:0 0 6px;">${escapeHtml(r.summary || '')}</p>
          <p style="margin:0;"><strong>Aktion:</strong> ${escapeHtml(r.action || '')}</p>
          ${sourceHtml}
        </div>
      `;
      }).join('');
      
      regulationHtml = `<h2 style="font-size: 18px; margin-top: 32px;">Regulatorik & Förderung</h2>${regulation}`;
  }

  // --- RENDERING: PDF BLOCK ---
  const pdfBlock = pdfUrl ? `
    <div style="margin-top: 24px; padding: 16px; text-align: center; background-color:#f1f5f9; border-radius: 8px;">
      <a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener" style="font-weight:bold;text-decoration:none;color:${primaryColor};">
        📄 Gesamtes Briefing als PDF herunterladen
      </a>
    </div>
  ` : '';

  // --- ZUSAMMENBAU DES GESAMTEN HTML ---
  const contentHtml = `
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Ihre wichtigsten Branchen-Entwicklungen, zusammengefasst in 60 Sekunden.</p>
    <h2 style="font-size: 18px; margin-top: 24px;">Top Insights</h2>
    ${topInsightsHtml}
    
    ${eventHtml}
    
    ${regulationHtml}
    ${pdfBlock}
  `;

  return renderLayout({
    preheader: (briefing.top_insights && briefing.top_insights[0]?.title) || 'Ihr neues Briefing ist da',
    title,
    contentHtml,
    ctaLabel: 'Alle Daten im Dashboard ansehen',
    ctaUrl: getBaseUrl(),
    partner
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