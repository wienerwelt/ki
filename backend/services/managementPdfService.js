const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 38;

const WIN_ANSI = new Map([
  ['€', 0x80], ['‚', 0x82], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
  ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
  ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function encodeWinAnsi(value) {
  const bytes = [];
  for (const character of cleanText(value)) {
    const codePoint = character.codePointAt(0);
    if (WIN_ANSI.has(character)) bytes.push(WIN_ANSI.get(character));
    else if (codePoint >= 32 && codePoint <= 255) bytes.push(codePoint);
    else bytes.push(0x3f);
  }
  return Buffer.from(bytes).toString('hex').toUpperCase();
}

function parseHexColor(value, fallback = '#e31b23') {
  const color = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
  return [
    parseInt(color.slice(1, 3), 16) / 255,
    parseInt(color.slice(3, 5), 16) / 255,
    parseInt(color.slice(5, 7), 16) / 255,
  ];
}

function colorCommand(color, operator = 'rg') {
  return `${color.map((part) => part.toFixed(3)).join(' ')} ${operator}`;
}

function wrapText(value, maxWidth, fontSize, maxLines = Infinity) {
  const text = cleanText(value);
  if (!text) return [];
  const maxCharacters = Math.max(4, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const chunks = [];
    for (let index = 0; index < word.length; index += maxCharacters) {
      chunks.push(word.slice(index, index + maxCharacters));
    }
    for (const chunk of chunks) {
      const candidate = current ? `${current} ${chunk}` : chunk;
      if (candidate.length <= maxCharacters) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = chunk;
      }
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, maxCharacters - 3)).trim()}...`;
  }
  return lines;
}

function buildPdf(pages) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', null];
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const pageReferences = [];

  for (const page of pages) {
    const content = page.commands.join('\n');
    const contentId = objects.length;
    objects.push(`<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`);
    const annotationReferences = page.links.map((link) => {
      const annotationId = objects.length;
      objects.push(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI <${encodeWinAnsi(link.url)}> >> >>`);
      return `${annotationId} 0 R`;
    });
    const pageId = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R${annotationReferences.length ? ` /Annots [${annotationReferences.join(' ')}]` : ''} >>`);
    pageReferences.push(`${pageId} 0 R`);
  }

  objects[2] = `<< /Type /Pages /Kids [${pageReferences.join(' ')}] /Count ${pageReferences.length} >>`;

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  let offset = chunks[0].length;
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = offset;
    const chunk = Buffer.from(`${index} 0 obj\n${objects[index]}\nendobj\n`, 'ascii');
    chunks.push(chunk);
    offset += chunk.length;
  }
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length}\n`, '0000000000 65535 f \n'];
  for (let index = 1; index < objects.length; index += 1) {
    xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  chunks.push(Buffer.from(xref.join(''), 'ascii'));
  return Buffer.concat(chunks);
}

function createPage() {
  return { commands: [], links: [] };
}

function drawRect(page, x, top, width, height, fill, stroke = null, radiusIgnored = 0) {
  void radiusIgnored;
  const y = PAGE_HEIGHT - top - height;
  page.commands.push('q');
  if (fill) page.commands.push(colorCommand(fill, 'rg'));
  if (stroke) page.commands.push(colorCommand(stroke, 'RG'), '0.7 w');
  page.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  page.commands.push('Q');
}

function drawText(page, value, x, top, options = {}) {
  const {
    size = 10,
    bold = false,
    color = [0.078, 0.125, 0.2],
  } = options;
  const y = PAGE_HEIGHT - top - size;
  page.commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colorCommand(color)} 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${encodeWinAnsi(value)}> Tj ET`);
}

function drawLines(page, value, x, top, width, options = {}) {
  const {
    size = 10,
    lineHeight = size * 1.3,
    maxLines = Infinity,
    ...textOptions
  } = options;
  const lines = wrapText(value, width, size, maxLines);
  lines.forEach((line, index) => drawText(page, line, x, top + index * lineHeight, { ...textOptions, size }));
  return { lines, height: lines.length * lineHeight };
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch (_) {
    return null;
  }
}

function addLink(page, url, x, top, width, height) {
  const normalized = safeUrl(url);
  if (!normalized) return;
  page.links.push({
    url: normalized,
    rect: [
      x.toFixed(2),
      (PAGE_HEIGHT - top - height).toFixed(2),
      (x + width).toFixed(2),
      (PAGE_HEIGHT - top).toFixed(2),
    ],
  });
}

function renderAccountRadarManagementPdf({
  partnerName,
  primaryColor,
  generatedAt,
  signals = [],
  frontendUrl,
  salesStageLabels = {},
  analytics = null,
  campaigns = [],
}) {
  const brand = parseHexColor(primaryColor);
  const navy = [0.055, 0.102, 0.184];
  const muted = [0.392, 0.455, 0.545];
  const border = [0.878, 0.898, 0.925];
  const soft = [0.969, 0.976, 0.984];
  const green = [0.086, 0.451, 0.235];
  const red = [0.796, 0.145, 0.145];
  const blue = [0.145, 0.388, 0.922];
  const pages = [];

  const accountMap = signals.reduce((result, signal) => {
    const name = cleanText(signal.account_name) || 'Account';
    const current = result.get(name) || { name, count: 0, high: 0, max: 0 };
    current.count += 1;
    current.high += Number(signal.relevance_score || 0) >= 80 ? 1 : 0;
    current.max = Math.max(current.max, Number(signal.relevance_score || 0));
    result.set(name, current);
    return result;
  }, new Map());
  const accounts = Array.from(accountMap.values())
    .sort((left, right) => right.high - left.high || right.count - left.count || right.max - left.max);
  const highRelevance = signals.filter((signal) => Number(signal.relevance_score || 0) >= 80).length;
  const averageRelevance = signals.length
    ? Math.round(signals.reduce((sum, signal) => sum + Number(signal.relevance_score || 0), 0) / signals.length)
    : 0;
  const competitorSignals = signals.filter((signal) => Boolean(signal.competitor_name)).length;
  const stageSummary = Object.entries(salesStageLabels)
    .map(([stage, label]) => ({ label, count: signals.filter((signal) => signal.sales_stage === stage).length }))
    .filter((item) => item.count > 0);
  const campaignSummary = Array.isArray(campaigns) ? campaigns : [];
  const euro = (value) => `${Math.round(Number(value || 0)).toLocaleString('de-DE')} EUR`;
  const campaignGoalProgress = (campaign) => {
    const pairs = [
      [campaign.account_count, campaign.target_accounts],
      [campaign.contacted_count, campaign.target_contacts],
      [campaign.meeting_count, campaign.target_meetings],
      [campaign.offer_count, campaign.target_offers],
      [campaign.won_count, campaign.target_wins],
      [campaign.open_pipeline_value_eur, campaign.target_pipeline_eur],
    ].filter(([, target]) => Number(target || 0) > 0);
    if (!pairs.length) return null;
    return Math.round(pairs.reduce((sum, [actual, target]) => sum + Math.min(100, (Number(actual || 0) / Number(target)) * 100), 0) / pairs.length);
  };

  const addFooter = (page, pageNumber) => {
    drawRect(page, PAGE_MARGIN, 809, PAGE_WIDTH - PAGE_MARGIN * 2, 0.7, border);
    drawText(page, `${partnerName || 'Mobiliti'} · Account-Radar · Seite ${pageNumber}`, PAGE_MARGIN, 816, { size: 8, color: muted });
    drawText(page, 'Vertraulich · Management-Auswertung', 400, 816, { size: 8, color: muted });
  };

  const startPage = (continued = false) => {
    const page = createPage();
    pages.push(page);
    drawRect(page, PAGE_MARGIN, 34, PAGE_WIDTH - PAGE_MARGIN * 2, 4, brand);
    drawText(page, `${partnerName || 'Mobiliti'} · MANAGEMENT-AUSWERTUNG`, PAGE_MARGIN, 49, { size: 9, bold: true, color: muted });
    drawText(page, continued ? 'Account-Radar · Signale (Fortsetzung)' : 'Account-Radar', PAGE_MARGIN, 68, { size: continued ? 20 : 26, bold: true, color: navy });
    if (continued) drawText(page, `Erstellt am ${generatedAt}`, PAGE_MARGIN, 96, { size: 9, color: muted });
    return page;
  };

  let page = startPage(false);
  drawText(page, 'Priorisierte offene Gesprächsanlässe der letzten 30 Tage', PAGE_MARGIN, 101, { size: 11, color: navy });
  drawText(page, `Erstellt am ${generatedAt}`, PAGE_MARGIN, 119, { size: 9, color: muted });

  const kpis = [
    [signals.length, 'Priorisierte Signale', brand],
    [accounts.length, 'Betroffene Accounts', blue],
    [highRelevance, 'Hoch relevant', red],
    [`${averageRelevance}%`, 'Durchschnitt Relevanz', green],
  ];
  const kpiGap = 9;
  const kpiWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - kpiGap * 3) / 4;
  kpis.forEach(([value, label, tone], index) => {
    const x = PAGE_MARGIN + index * (kpiWidth + kpiGap);
    drawRect(page, x, 148, kpiWidth, 66, soft, border);
    drawRect(page, x, 148, kpiWidth, 4, tone);
    drawText(page, value, x + 10, 161, { size: 21, bold: true, color: navy });
    drawLines(page, label, x + 10, 188, kpiWidth - 20, { size: 8.5, maxLines: 2, color: muted });
  });

  drawText(page, 'Top-Accounts dieser Auswertung', PAGE_MARGIN, 237, { size: 14, bold: true, color: navy });
  drawText(page, 'Management-Überblick', 365, 237, { size: 14, bold: true, color: navy });
  drawRect(page, PAGE_MARGIN, 259, 309, 116, [1, 1, 1], border);
  drawRect(page, 365, 259, 192, 116, [1, 1, 1], border);
  if (accounts.length) {
    accounts.slice(0, 5).forEach((account, index) => {
      const top = 270 + index * 19;
      drawLines(page, account.name, PAGE_MARGIN + 10, top, 155, { size: 9, maxLines: 1, bold: true, color: navy });
      drawText(page, `${account.count} Signale · ${account.high} hoch · max. ${account.max}%`, 210, top, { size: 8, color: muted });
    });
  } else {
    drawText(page, 'Keine priorisierten Signale vorhanden.', PAGE_MARGIN + 10, 272, { size: 9, color: muted });
  }
  drawText(page, `${competitorSignals}`, 377, 271, { size: 20, bold: true, color: navy });
  drawText(page, 'Wettbewerbssignale', 410, 277, { size: 8.5, color: muted });
  drawText(page, 'Vertriebsphasen', 377, 307, { size: 9, bold: true, color: navy });
  drawLines(
    page,
    stageSummary.length ? stageSummary.map((item) => `${item.label}: ${item.count}`).join(' · ') : 'Noch keine Phasen gesetzt.',
    377,
    324,
    166,
    { size: 8.5, lineHeight: 12, maxLines: 3, color: muted }
  );

  let cursorTop = 403;
  const drawSignalHeader = () => {
    drawText(page, 'Priorisierte Signale und nächste Schritte', PAGE_MARGIN, cursorTop, { size: 14, bold: true, color: navy });
    cursorTop += 24;
    drawRect(page, PAGE_MARGIN, cursorTop, PAGE_WIDTH - PAGE_MARGIN * 2, 24, soft, border);
    drawText(page, 'ACCOUNT', PAGE_MARGIN + 7, cursorTop + 7, { size: 7.5, bold: true, color: muted });
    drawText(page, 'SIGNAL / QUELLE', 148, cursorTop + 7, { size: 7.5, bold: true, color: muted });
    drawText(page, 'SCORE', 347, cursorTop + 7, { size: 7.5, bold: true, color: muted });
    drawText(page, 'NÄCHSTER SCHRITT', 397, cursorTop + 7, { size: 7.5, bold: true, color: muted });
    cursorTop += 24;
  };
  drawSignalHeader();

  if (!signals.length) {
    drawText(page, 'Für diese Periode liegen keine priorisierten offenen Signale vor.', PAGE_MARGIN + 7, cursorTop + 15, { size: 10, color: muted });
    cursorTop += 48;
  }

  signals.forEach((signal) => {
    const rowHeight = 75;
    if (cursorTop + rowHeight > 790) {
      page = startPage(true);
      cursorTop = 124;
      drawSignalHeader();
    }
    drawRect(page, PAGE_MARGIN, cursorTop, PAGE_WIDTH - PAGE_MARGIN * 2, rowHeight, [1, 1, 1], border);
    drawLines(page, signal.account_name || 'Account', PAGE_MARGIN + 7, cursorTop + 9, 96, { size: 9, lineHeight: 12, maxLines: 2, bold: true, color: navy });
    if (signal.competitor_name) {
      drawLines(page, `Wettbewerb: ${signal.competitor_name}`, PAGE_MARGIN + 7, cursorTop + 39, 96, { size: 7.5, lineHeight: 10, maxLines: 2, color: muted });
    }
    const titleResult = drawLines(page, signal.article_title || 'Account-Signal', 148, cursorTop + 8, 185, { size: 8.5, lineHeight: 11, maxLines: 3, bold: true, color: navy });
    addLink(page, signal.article_url, 148, cursorTop + 7, 185, Math.max(12, titleResult.height));
    drawLines(page, signal.signal_type || signal.source_name || 'Account-Signal', 148, cursorTop + 46, 185, { size: 7.5, maxLines: 1, color: muted });
    drawText(page, `${Number(signal.relevance_score || 0)}%`, 347, cursorTop + 13, { size: 12, bold: true, color: brand });
    drawLines(page, signal.recommended_action || 'Signal prüfen und nächsten Schritt festlegen.', 397, cursorTop + 8, 153, { size: 8, lineHeight: 10.5, maxLines: 5, bold: true, color: green });
    cursorTop += rowHeight;
  });

  const radarUrl = safeUrl(frontendUrl);
  if (cursorTop + 44 <= 790) {
    drawRect(page, PAGE_MARGIN, cursorTop + 16, PAGE_WIDTH - PAGE_MARGIN * 2, 28, soft, border);
    drawText(page, 'Detailansicht im Account-Radar öffnen', PAGE_MARGIN + 9, cursorTop + 25, { size: 9, bold: true, color: brand });
    addLink(page, radarUrl, PAGE_MARGIN + 7, cursorTop + 18, 220, 22);
  }

  if (campaignSummary.length) {
    page = createPage();
    pages.push(page);
    drawRect(page, PAGE_MARGIN, 34, PAGE_WIDTH - PAGE_MARGIN * 2, 4, brand);
    drawText(page, `${partnerName || 'Mobiliti'} · MANAGEMENT-AUSWERTUNG`, PAGE_MARGIN, 49, { size: 9, bold: true, color: muted });
    drawText(page, 'Kampagnen-Steuerung', PAGE_MARGIN, 68, { size: 22, bold: true, color: navy });
    drawText(page, 'Aktueller Stand über Accounts, Aufgaben, Termine und Pipeline.', PAGE_MARGIN, 99, { size: 10, color: muted });

    const activeCampaigns = campaignSummary.filter((campaign) => campaign.status === 'active').length;
    const assignedAccounts = campaignSummary.reduce((sum, campaign) => sum + Number(campaign.account_count || 0), 0);
    const openTasks = campaignSummary.reduce((sum, campaign) => sum + Number(campaign.open_task_count || 0), 0);
    const overdueTasks = campaignSummary.reduce((sum, campaign) => sum + Number(campaign.overdue_count || 0), 0);
    const campaignKpis = [
      [activeCampaigns, 'Aktive Kampagnen', green],
      [assignedAccounts, 'Account-Zuordnungen', blue],
      [openTasks, 'Offene Aufgaben', brand],
      [overdueTasks, 'Überfällige Termine', overdueTasks ? red : green],
    ];
    campaignKpis.forEach(([value, label, tone], index) => {
      const x = PAGE_MARGIN + index * (kpiWidth + kpiGap);
      drawRect(page, x, 132, kpiWidth, 66, soft, border);
      drawRect(page, x, 132, kpiWidth, 4, tone);
      drawText(page, value, x + 10, 145, { size: 19, bold: true, color: navy });
      drawLines(page, label, x + 10, 173, kpiWidth - 20, { size: 8.5, maxLines: 2, color: muted });
    });

    drawText(page, 'Kampagnen im Überblick', PAGE_MARGIN, 225, { size: 14, bold: true, color: navy });
    campaignSummary.slice(0, 6).forEach((campaign, index) => {
      const top = 247 + index * 78;
      const statusColor = campaign.status === 'active' ? green : campaign.status === 'completed' ? muted : [0.722, 0.412, 0.047];
      const goalProgress = campaignGoalProgress(campaign);
      drawRect(page, PAGE_MARGIN, top, PAGE_WIDTH - PAGE_MARGIN * 2, 68, [1, 1, 1], border);
      drawRect(page, PAGE_MARGIN, top, 4, 68, statusColor);
      drawLines(page, campaign.name, PAGE_MARGIN + 12, top + 9, 220, { size: 10.5, maxLines: 1, bold: true, color: navy });
      drawText(page, campaign.status === 'active' ? 'Aktiv' : campaign.status === 'completed' ? 'Abgeschlossen' : 'Entwurf', 414, top + 9, { size: 8.5, bold: true, color: statusColor });
      drawLines(page, `${campaign.account_count || 0} Accounts · ${campaign.signal_count || 0} Signale · ${campaign.open_task_count || 0} offen · ${campaign.done_count || 0} erledigt`, PAGE_MARGIN + 12, top + 30, 330, { size: 8.5, maxLines: 1, color: muted });
      drawLines(page, `${campaign.planned_count || 0} geplant · ${campaign.overdue_count || 0} überfällig · ${campaign.won_count || 0} gewonnen`, PAGE_MARGIN + 12, top + 47, 310, { size: 8.5, maxLines: 1, bold: true, color: Number(campaign.overdue_count || 0) ? red : green });
      drawLines(page, `Pipeline ${euro(campaign.open_pipeline_value_eur)} · gewichtet ${euro(campaign.weighted_pipeline_value_eur)}${goalProgress === null ? '' : ` · Zielgrad ${goalProgress}%`}`, 351, top + 31, 190, { size: 8, lineHeight: 11, maxLines: 2, color: navy });
    });
    if (campaignSummary.length > 6) {
      drawText(page, `Weitere ${campaignSummary.length - 6} Kampagnen finden Sie im Account-Radar.`, PAGE_MARGIN, 726, { size: 8.5, color: muted });
    }
    drawRect(page, PAGE_MARGIN, 750, PAGE_WIDTH - PAGE_MARGIN * 2, 28, soft, border);
    drawText(page, 'Kampagnen und Termine im Account-Radar öffnen', PAGE_MARGIN + 9, 759, { size: 9, bold: true, color: brand });
    addLink(page, radarUrl, PAGE_MARGIN + 7, 752, 245, 22);
  }

  if (analytics?.metrics) {
    const metrics = analytics.metrics;
    page = createPage();
    pages.push(page);
    drawRect(page, PAGE_MARGIN, 34, PAGE_WIDTH - PAGE_MARGIN * 2, 4, brand);
    drawText(page, `${partnerName || 'Mobiliti'} · MANAGEMENT-AUSWERTUNG`, PAGE_MARGIN, 49, { size: 9, bold: true, color: muted });
    drawText(page, 'Vertriebserfolg · letzte 30 Tage', PAGE_MARGIN, 68, { size: 22, bold: true, color: navy });
    drawText(page, 'Vom erkannten Signal über den Kontakt bis zum Abschluss.', PAGE_MARGIN, 99, { size: 10, color: muted });

    const salesKpis = [
      [metrics.signals, 'Signale', brand],
      [`${metrics.signalToContactPercent}%`, 'Signal → Kontakt', blue],
      [metrics.averageResponseHours === null ? '–' : `${metrics.averageResponseHours} h`, 'Ø Reaktionszeit', green],
      [`${metrics.winRatePercent}%`, 'Abschlussquote', red],
    ];
    salesKpis.forEach(([value, label, tone], index) => {
      const x = PAGE_MARGIN + index * (kpiWidth + kpiGap);
      drawRect(page, x, 132, kpiWidth, 66, soft, border);
      drawRect(page, x, 132, kpiWidth, 4, tone);
      drawText(page, value, x + 10, 145, { size: 19, bold: true, color: navy });
      drawLines(page, label, x + 10, 173, kpiWidth - 20, { size: 8.5, maxLines: 2, color: muted });
    });

    drawText(page, 'Vertriebsaktivität', PAGE_MARGIN, 225, { size: 14, bold: true, color: navy });
    drawRect(page, PAGE_MARGIN, 247, PAGE_WIDTH - PAGE_MARGIN * 2, 72, [1, 1, 1], border);
    [
      ['Kontakte', metrics.contacts], ['Meetings', metrics.meetings], ['Angebote', metrics.offers],
      ['Gewonnen', metrics.wins], ['Verloren', metrics.losses],
    ].forEach(([label, value], index) => {
      const x = PAGE_MARGIN + 15 + index * 100;
      drawText(page, value, x, 260, { size: 18, bold: true, color: index === 3 ? green : index === 4 ? red : navy });
      drawText(page, label, x, 287, { size: 8.5, color: muted });
    });

    drawText(page, 'Pipeline und Umsatz', PAGE_MARGIN, 345, { size: 14, bold: true, color: navy });
    const pipelineCards = [
      [euro(metrics.openPipelineValueEur), 'Offener Pipeline-Wert'],
      [euro(metrics.weightedPipelineValueEur), 'Gewichteter Pipeline-Wert'],
      [euro(metrics.wonRevenueEur), 'Gewonnener Umsatz · Bestand'],
    ];
    pipelineCards.forEach(([value, label], index) => {
      const width = 164;
      const x = PAGE_MARGIN + index * (width + 10);
      drawRect(page, x, 367, width, 65, soft, border);
      drawText(page, value, x + 10, 381, { size: 15, bold: true, color: index === 2 ? green : navy });
      drawLines(page, label, x + 10, 406, width - 20, { size: 8.5, maxLines: 2, color: muted });
    });

    drawText(page, 'Erfolgreichste Quellen', PAGE_MARGIN, 462, { size: 14, bold: true, color: navy });
    drawText(page, 'Trefferqualität', 365, 462, { size: 14, bold: true, color: navy });
    drawRect(page, PAGE_MARGIN, 484, 309, 150, [1, 1, 1], border);
    drawRect(page, 365, 484, 192, 150, [1, 1, 1], border);
    if (analytics.topSources?.length) {
      analytics.topSources.slice(0, 6).forEach((source, index) => {
        const top = 496 + index * 21;
        drawLines(page, source.source, PAGE_MARGIN + 10, top, 174, { size: 8.5, maxLines: 1, bold: true, color: navy });
        drawText(page, `${source.contacts}/${source.signals} Kontakte · ${source.contactConversionPercent}%`, 220, top, { size: 7.5, color: muted });
      });
    } else drawText(page, 'Noch keine Quelldaten.', PAGE_MARGIN + 10, 498, { size: 9, color: muted });
    drawText(page, `${metrics.irrelevant} irrelevante Treffer (${metrics.irrelevantPercent}%)`, 377, 497, { size: 9, bold: true, color: navy });
    drawLines(
      page,
      analytics.irrelevantReasons?.length
        ? analytics.irrelevantReasons.slice(0, 6).map((item) => `${item.label}: ${item.count}`).join(' · ')
        : 'Noch keine Gründe erfasst.',
      377,
      520,
      166,
      { size: 8.5, lineHeight: 13, maxLines: 7, color: muted }
    );

    drawRect(page, PAGE_MARGIN, 666, PAGE_WIDTH - PAGE_MARGIN * 2, 64, soft, border);
    drawText(page, 'Einordnung', PAGE_MARGIN + 10, 679, { size: 10, bold: true, color: navy });
    drawLines(page, 'Umsatzwerte beziehen sich auf die aktuell im Account-Radar gepflegten Opportunities. Conversion und Aktivitäten werden für den Berichtszeitraum berechnet. Irrelevanzgründe helfen, Quellen und Suchprofile gezielt zu verbessern.', PAGE_MARGIN + 10, 698, PAGE_WIDTH - PAGE_MARGIN * 2 - 20, { size: 8.5, lineHeight: 12, maxLines: 3, color: muted });
  }
  pages.forEach((currentPage, index) => addFooter(currentPage, index + 1));
  return buildPdf(pages);
}

module.exports = { renderAccountRadarManagementPdf };
