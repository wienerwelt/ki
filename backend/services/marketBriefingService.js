// backend/services/marketBriefingService.js
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const { generateAIContent, logToDb } = require('./aiExecutionService');
const { sendEmail } = require('./emailService');
const { renderFleetDailyBriefingEmail } = require('./emailTemplates');
const { renderPdfFromHtml, writePdfToDisk } = require('./pdfService');

function cleanAndParseJson(aiResponse) {
  const startIndex = aiResponse.indexOf('{');
  const endIndex = aiResponse.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Kein valides JSON-Objekt in der KI-Antwort gefunden.');
  }
  const jsonString = aiResponse.substring(startIndex, endIndex + 1);
  try {
    return JSON.parse(jsonString);
  } catch (parseError) {
    console.error('Fehler beim Parsen des bereinigten JSON-Strings:', jsonString);
    throw new Error('Die KI-Antwort konnte auch nach der Bereinigung nicht als JSON geparst werden.');
  }
}

async function aggregateDataForPartner(partner) {
  const dataBlocks = [];
  let nextEvent = null;

  const client = await db.connect();
  try {
    const industryNames = (partner.industries || []).map(ind => ind.name);
    if (industryNames.length === 0) return { dataBlocksString: '', nextEvent: null };

    const industryPatterns = industryNames.map(name => `${name}%`);
    const matchingCategoriesRes = await client.query(
      `SELECT id FROM categories WHERE name LIKE ANY($1::text[])`,
      [industryPatterns]
    );
    const allRelevantCategoryIds = matchingCategoriesRes.rows.map(r => r.id);

    if (allRelevantCategoryIds.length === 0) {
      console.log(`[BriefingService] Keine passenden Content-Kategorien für ${industryNames.join(', ')}.`);
      return { dataBlocksString: '', nextEvent: null };
    }

    // Minimaler Indikatorblock (erweitert ihr später um Fuels/EV/etc.)
    const indicatorsRes = await client.query(
      `SELECT indicator_name, value, unit
       FROM economic_indicators
       WHERE indicator_name IN ('BRENT_OIL', 'EUR_USD', 'EURIBOR_3M', 'ECB_RATE')
       ORDER BY data_timestamp DESC
       LIMIT 12`
    );
    if (indicatorsRes.rows.length > 0) {
      dataBlocks.push(
        '## Wirtschaftsdaten:\n' +
        indicatorsRes.rows.map(r => `- ${r.indicator_name}: ${r.value} ${r.unit}`).join('\n')
      );
    }

    // News + Quellen (wichtig)
    const newsRes = await client.query(
      `SELECT title, summary, original_url, published_date
       FROM scraped_content
       WHERE category_id = ANY($1::uuid[])
         AND published_date >= NOW() - INTERVAL '3 days'
       ORDER BY published_date DESC, relevance_score DESC
       LIMIT 8`,
      [allRelevantCategoryIds]
    );

    if (newsRes.rows.length > 0) {
      dataBlocks.push(
        '## Aktuelle Branchen-News (mit Quellen):\n' +
        newsRes.rows.map(r =>
          `- TITLE: ${r.title}\n  SUMMARY: ${r.summary}\n  DATE: ${new Date(r.published_date).toISOString().slice(0, 10)}\n  SOURCE: ${r.original_url}`
        ).join('\n')
      );
    }

    // Events anhand Partner-Regionen
    const partnerRegionsRes = await client.query(
      `SELECT r.name
       FROM regions r
       JOIN business_partner_regions bpr ON r.id = bpr.region_id
       WHERE bpr.business_partner_id = $1`,
      [partner.id]
    );
    const partnerRegions = partnerRegionsRes.rows.map(r => r.name);

    if (partnerRegions.length > 0) {
      const eventsRes = await client.query(
        `SELECT title, event_date, region, original_url
         FROM scraped_content
         WHERE event_date > NOW()
           AND region = ANY($1::text[])
         ORDER BY event_date ASC
         LIMIT 3`,
        [partnerRegions]
      );

      if (eventsRes.rows.length > 0) {
        dataBlocks.push(
          '## Kommende Events (mit Links):\n' +
          eventsRes.rows.map(r =>
            `- DATE: ${new Date(r.event_date).toISOString().slice(0, 10)}\n  TITLE: ${r.title}\n  REGION: ${r.region}\n  SOURCE: ${r.original_url}`
          ).join('\n')
        );
        nextEvent = eventsRes.rows[0];
      }
    }

    // Optional Sales-Intelligence (bleibt, aber fürs Fuhrpark-Daily nicht Pflicht)
    if (partner.dashboard_focus === 'sales') {
      const intelligenceRes = await client.query(
        `SELECT bpa.name as account_name, bpta.article_title, bpta.competitor_name
         FROM business_partner_tracked_articles bpta
         JOIN business_partner_accounts bpa ON bpta.account_id = bpa.id
         WHERE bpa.business_partner_id = $1
           AND bpta.created_at >= NOW() - INTERVAL '3 days'
         ORDER BY bpta.created_at DESC
         LIMIT 10`,
        [partner.id]
      );

      if (intelligenceRes.rows.length > 0) {
        dataBlocks.push(
          '## Aktivitäten zu betreuten Kunden & Wettbewerbern:\n' +
          intelligenceRes.rows.map(r => {
            return r.competitor_name
              ? `- Wettbewerber "${r.competitor_name}" (von Kunde ${r.account_name}): ${r.article_title}`
              : `- Kunde "${r.account_name}": ${r.article_title}`;
          }).join('\n')
        );
      }
    }
  } finally {
    client.release();
  }

  return { dataBlocksString: dataBlocks.join('\n\n'), nextEvent };
}

function createMasterPrompt(aggregatedData, partner) {
  const industries = (partner.industries || []).map(ind => ind.name).join(', ');

  return `
DU BIST: Senior-Branchenanalyst für Fuhrpark/Mobilität (AT/DE).
ZIEL: Erstelle ein Daily Briefing, das ein Fuhrparkleiter in 60 Sekunden versteht.

HARTREGELN:
- Verwende AUSSCHLIESSLICH Infos aus den Rohdaten.
- JEDER "top_insight" MUSS mind. 1 echte URL in sources[] enthalten.
- Keine erfundenen Zahlen/Links.
- Priorisierung: Relevanz + Neuigkeit + Business Impact.

Gib NUR valides JSON zurück (keine Markdown).

SCHEMA:
{
  "created_at": "YYYY-MM-DD",
  "top_insights": [
    { "title": "", "what_changed": "", "so_what": "", "action": "", "sources": ["https://..."] }
  ],
  "cost_drivers": [
    { "driver": "Energie|Zinsen|FX|...", "value": "", "trend": "up|down|flat", "impact": "" }
  ],
  "regulation_and_funding": [
    { "title": "", "deadline": "YYYY-MM-DD|optional", "summary": "", "action": "", "source": "https://..." }
  ],
  "industry_radar": [
    { "title": "", "summary": "", "source": "https://...", "published_date": "YYYY-MM-DD" }
  ],
  "recommended_actions": ["", "", ""],
  "confidence_note": ""
}

KONSTRAINTS:
- top_insights: genau 3
- industry_radar: genau 3
- regulation_and_funding: max 2 (nur wenn wirklich relevant)
- recommended_actions: genau 3, kurz & operativ

KONTEXT: Partner-Branchen = ${industries}

ROHDATEN:
---
${aggregatedData}
---
`;
}

function getBackendPublicUrl() {
  // öffentliche API-Basis (für PDF-Download-Link)
  const raw = (process.env.BACKEND_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5173').trim();
  return raw.replace(/\/+$/, '');
}

async function createPdfExportLink({ client, businessPartnerId, briefingDate, analysisResult, nextEvent }) {
    // 1. Branding-Daten holen
    const branding = await getPartnerBranding(businessPartnerId);
    
    // 2. HTML Template mit Branding-Farben rendern
    // Wir nutzen hier CSS-Variablen basierend auf den DB-Farben
    const brandedHtml = renderFleetDailyBriefingEmail({
        briefing: analysisResult,
        brandLogoUrl: branding.logo_url,
        dashboardTitle: branding.dashboard_title,
        nextEvent,
        pdfUrl: null, // Im PDF selbst brauchen wir keinen Link zum PDF
        colors: {
            primary: branding.primary_color || '#111',
            text: branding.primary_text_color || '#fff'
        }
    });

    const token = crypto.randomBytes(24).toString('hex');
    const pdfBuffer = await renderPdfFromHtml(brandedHtml);
  await writePdfToDisk(pdfBuffer, pdfPath);

  await client.query(
    `INSERT INTO business_partner_daily_briefing_exports
      (business_partner_id, created_at, token, pdf_path, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [businessPartnerId, new Date(), token, pdfPath, expiresAt]
  );

  // Download-Endpoint (du fügst Route in dataController hinzu, siehe unten)
  return `${getBackendPublicUrl()}/api/data/daily-briefing/pdf?token=${token}`;
}

async function generateBriefingsForAllPartners() {
  console.log('[BriefingService] Starte Tages-Briefings für alle Partner...');
  const client = await db.connect();

  try {
    const { rows: partners } = await client.query(
      `SELECT
         bp.id,
         bp.dashboard_focus,
         bp.dashboard_title,
         bp.logo_url,
         (
           SELECT COALESCE(json_agg(c.*), '[]'::json)
           FROM business_partner_categories bpc
           JOIN categories c ON bpc.category_id = c.id
           WHERE bpc.business_partner_id = bp.id AND c.category_type = 'industry'
         ) as industries
       FROM business_partners bp
       WHERE bp.is_active = TRUE;`
    );

    for (const partner of partners) {
      if (!partner.industries || partner.industries.length === 0) {
        console.log(`[BriefingService] Keine Branchen für Partner ${partner.id}. Überspringe.`);
        continue;
      }

      console.log(`[BriefingService] Verarbeite Partner: ${partner.id} (${partner.industries.map(i => i.name).join(', ')})`);

      let jobId;
      try {
        const jobRes = await client.query(`INSERT INTO ai_jobs (status, is_automated) VALUES ('running', TRUE) RETURNING id`);
        jobId = jobRes.rows[0].id;

        await logToDb(jobId, 'INFO', `Starte Briefing-Generierung für Partner ${partner.id}.`);

        const { dataBlocksString, nextEvent } = await aggregateDataForPartner(partner);

        if (!dataBlocksString) {
          await logToDb(jobId, 'SUCCESS', `Keine relevanten Daten für Partner ${partner.id}.`);
          await client.query(`UPDATE ai_jobs SET status = 'completed_no_results' WHERE id = $1`, [jobId]);
          continue;
        }

        const masterPrompt = createMasterPrompt(dataBlocksString, partner);

        const { aiResultString } = await generateAIContent({
          promptTemplate: masterPrompt,
          inputText: '',
          ai_provider: 'OpenAI GPT-4o',
          jobId,
        });

        const analysisResult = cleanAndParseJson(aiResultString);

        // Speichern + PDF-Link in einer Transaction
        await client.query('BEGIN');

        // 1) JSONB Daily Briefing speichern (Single Source of Truth)
        const briefingDate = new Date().toISOString().slice(0, 10);
await db.query(
    `INSERT INTO business_partner_intelligence_briefings (
        business_partner_id, 
        briefing_type, 
        headline, 
        analysis_summary, 
        prognosis, 
        talking_point, 
        related_articles
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
        bpId, 
        'daily_market', // Dein Typ
        kiResult.headline, 
        kiResult.analysis_summary, 
        kiResult.prognosis, 
        kiResult.talking_point, 
        JSON.stringify(kiResult.related_articles || [])
    ]
);

        // 2) Legacy: Market Briefing weiterhin in alter Tabelle speichern (optional, falls andere UI noch darauf zugreift)
        //    Wenn du das nicht mehr brauchst, kannst du diesen Block später entfernen.
        if (analysisResult.top_insights && analysisResult.top_insights[0]) {
          await client.query(
            `INSERT INTO business_partner_intelligence_briefings
             (business_partner_id, briefing_type, headline, analysis_summary, prognosis)
             VALUES ($1, 'market', $2, $3, $4)`,
            [
              partner.id,
              analysisResult.top_insights[0].title || 'Fuhrpark Daily',
              analysisResult.top_insights[0].so_what || '',
              analysisResult.confidence_note || ''
            ]
          );
        }

        await client.query('COMMIT');

        await logToDb(jobId, 'SUCCESS', `Daily Briefing (JSONB) für Partner ${partner.id} gespeichert.`);
        await client.query(`UPDATE ai_jobs SET status = 'completed' WHERE id = $1`, [jobId]);

        // Newsletter-Abonnenten
        const { rows: subscribers } = await client.query(
          `SELECT email, username
           FROM users
           WHERE business_partner_id = $1 AND newsletter_opt_in = TRUE AND is_active = TRUE`,
          [partner.id]
        );

        if (subscribers.length === 0) continue;

        // PDF-Link erzeugen (separat, damit wir das in Mail einbauen können)
        // Wir rendern die Mail-HTML, nutzen sie auch für PDF.
        const baseHtml = renderFleetDailyBriefingEmail({
          briefing: analysisResult,
          brandLogoUrl: partner.logo_url,
          dashboardTitle: partner.dashboard_title,
          nextEvent,
          pdfUrl: null
        });

        // Token/Link schreiben wir als DB-Export
        const pdfUrl = await createPdfExportLink({
          client,
          businessPartnerId: partner.id,
          briefingDate: new Date().toISOString().slice(0, 10),
          html: baseHtml,
        });

        const emailBody = renderFleetDailyBriefingEmail({
          briefing: analysisResult,
          brandLogoUrl: partner.logo_url,
          dashboardTitle: partner.dashboard_title,
          nextEvent,
          pdfUrl,
        });

        console.log(`[BriefingService] Versende ${subscribers.length} Fuhrpark Daily Mails für Partner ${partner.id}`);

        for (const subscriber of subscribers) {
          await sendEmail({
            to: subscriber.email,
            subject: `Fuhrpark Daily: ${analysisResult.top_insights?.[0]?.title || 'Ihre Top 3 Insights'}`,
            html: emailBody,
            fromName: partner.dashboard_title || 'Fuhrpark Daily'
          });
        }

      } catch (err) {
        console.error(`[BriefingService] Fehler bei Partner ${partner.id}:`, err.message);
        if (jobId) {
          await logToDb(jobId, 'ERROR', `Job abgebrochen: ${err.message}`);
          await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
        }
        try { await client.query('ROLLBACK'); } catch {}
      }
    }
  } catch (err) {
    console.error('[BriefingService] Kritischer Fehler:', err.message, err.stack);
  } finally {
    client.release();
  }
}

// (deine Sentiment-Funktion bleibt wie gehabt)
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function generateSentimentQuestionForPartner(partnerId) {
  const client = await db.connect();
  try {
    const briefingRes = await client.query(
      `SELECT headline, analysis_summary
       FROM business_partner_intelligence_briefings
       WHERE business_partner_id = $1 AND briefing_type = 'market'
       ORDER BY created_at DESC LIMIT 1`,
      [partnerId]
    );

    let contextText = '';
    if (briefingRes.rows.length > 0) {
      const b = briefingRes.rows[0];
      contextText = `SCHLAGZEILE: ${b.headline}\nZUSAMMENFASSUNG: ${b.analysis_summary}`;
    }

    if (!contextText) {
      const weekNumber = getWeekNumber(new Date());
      return `Branchenstimmung KW ${weekNumber}`;
    }

    const prompt = `
Basierend auf den folgenden aktuellen Nachrichten aus der Branche dieses Unternehmens,
formuliere EINE einzige, prägnante Frage für eine interne Umfrage (Sentiment Barometer).

KONTEXT:
${contextText}

ANFORDERUNGEN:
- Kurz (max. 10-12 Wörter)
- Spezifisch
- Positiv/Negativ beantwortbar
Gib NUR den Fragetext zurück.
`;

    const jobRes = await client.query(`INSERT INTO ai_jobs (status, is_automated) VALUES ('running', TRUE) RETURNING id`);
    const jobId = jobRes.rows[0].id;

    const { aiResultString } = await generateAIContent({
      promptTemplate: prompt,
      inputText: '',
      ai_provider: 'OpenAI GPT-4o',
      jobId
    });

    await client.query(`UPDATE ai_jobs SET status = 'completed' WHERE id = $1`, [jobId]);

    return aiResultString.replace(/^"|"$/g, '').trim();
  } catch (err) {
    console.error(`[SentimentAI] Fehler bei Partner ${partnerId}:`, err.message);
    const weekNumber = getWeekNumber(new Date());
    return `Marktstimmung KW ${weekNumber}`;
  } finally {
    client.release();
  }
}

module.exports = {
  generateBriefingsForAllPartners,
  generateSentimentQuestionForPartner
};