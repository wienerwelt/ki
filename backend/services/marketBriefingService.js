const db = require('../config/db');
const { generateAIContent, logToDb } = require('./aiExecutionService');

// ============================================================================
// ⚙️ KONFIGURATION DER FREQUENZEN
// ============================================================================
function getFrequencyConfig(frequency) {
    switch (frequency) {
        case 'weekly':
            return { sqlInterval: '7 days', promptText: 'einen umfassenden Wochenrückblick', limit: 20 };
        case 'biweekly':
            return { sqlInterval: '14 days', promptText: 'einen 14-tägigen Marktbericht', limit: 25 };
        case 'monthly':
            return { sqlInterval: '30 days', promptText: 'ein strategisches Monats-Summary', limit: 40 };
        case 'daily':
        default:
            return { sqlInterval: '3 days', promptText: 'ein Daily Briefing', limit: 10 };
    }
}

async function aggregateDataForPartner(client, partner, freqConfig) {
    const dataBlocks = [];

    try {
        // 1. WIRTSCHAFTSDATEN (Commodities)
        const ecoRes = await client.query(
        `SELECT DISTINCT ON (indicator_name) 
                indicator_name, 
                value, 
                unit, 
                source, 
                data_timestamp 
            FROM economic_indicators
            WHERE data_timestamp >= NOW() - INTERVAL '7 days'
            AND source IS NOT NULL 
            AND source <> ''
            ORDER BY indicator_name, data_timestamp DESC`
        );

        if (ecoRes.rows.length > 0) {
            const formattedRows = ecoRes.rows.map(r => {
                const date = new Date(r.data_timestamp).toLocaleDateString('de-DE');
                // OPTIMIERT: Quelle (source) wird jetzt explizit an die KI übergeben
                return `- ${r.indicator_name}: ${parseFloat(r.value).toLocaleString('de-DE')} ${r.unit} (Stand: ${date}) | [QUELL-URL: ${r.source || 'Keine URL vorhanden'}]`;
            });
            dataBlocks.push('## WIRTSCHAFTSDATEN & ROHSTOFFE:\n' + formattedRows.join('\n'));
        }

// 2. NEWS & ARTIKEL (Optimierter Filter auf *_news)
        const newsRes = await client.query(
            `SELECT title, summary, original_url, COALESCE(published_date, DATE(created_at)) as pub_date 
             FROM scraped_content sc
             WHERE (
                 -- A: Exklusiv für diesen Partner
                 sc.source_identifier = $1
                 
                 -- B: ODER allgemeine News (endet auf _news, aber KEINE fremde Partner-UUID davor)
                 OR (
                    sc.source_identifier LIKE '%_news' 
                    AND sc.source_identifier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_news$'
                 )
             )
             AND sc.original_url IS NOT NULL AND sc.original_url <> ''
             AND COALESCE(sc.published_date, sc.created_at) >= NOW() - INTERVAL '${freqConfig.sqlInterval}'
             AND sc.event_date IS NULL
             ORDER BY COALESCE(sc.published_date, sc.created_at) DESC 
             LIMIT ${freqConfig.limit}`,
            [`${partner.id}_news`]
        );
        
        if (newsRes.rows.length > 0) {
            const newsText = newsRes.rows.map(r => 
                `---\nTITEL: ${r.title}\nINHALT: ${r.summary}\n[QUELL-URL: ${r.original_url}]`
            ).join('\n');
            dataBlocks.push(`## RELEVANTE NEWS DER LETZTEN ${freqConfig.sqlInterval.toUpperCase()}:\n${newsText}`);
        }

        // 3. ANSTEHENDE EVENTS & TERMINE
        const eventsRes = await client.query(
            `SELECT title, summary, original_url, event_date, region 
            FROM scraped_content sc
            WHERE (
                -- A: Exklusiv für diesen Partner (z.B. interne Schulungen)
                sc.source_identifier = $1
                
                -- B: ODER allgemeine Branchen-Termine
                OR (
                    sc.source_identifier LIKE '%_events'
                    AND sc.source_identifier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_events$'
                )
            )
            -- C: Validierung (URL muss da sein, Datum in der Zukunft)
            AND sc.original_url IS NOT NULL 
            AND sc.original_url <> ''
            AND sc.event_date >= CURRENT_DATE
            
            ORDER BY sc.event_date ASC 
            LIMIT 5`,
            [`${partner.id}_events`]
        );

        if (eventsRes.rows.length > 0) {
            const eventsText = eventsRes.rows.map(r => 
                `---\nEVENT: ${r.title}\nDATUM: ${new Date(r.event_date).toLocaleDateString('de-DE')} | ORT: ${r.region || 'Online/K.A.'}\nINHALT: ${r.summary}\n[QUELL-URL: ${r.original_url}]`
            ).join('\n');
            dataBlocks.push(`## ANSTEHENDE EVENTS & TERMINE:\n${eventsText}`);
        }

        // 4. FÖRDERUNGEN & GESETZE
        const regRes = await client.query(
            `SELECT title, summary, original_url 
            FROM scraped_content sc
            WHERE sc.source_identifier IN ('foerderungen_at', 'gesetze_at_kfz')
            -- NEU: Nur Einträge mit gültiger URL zulassen
            AND sc.original_url IS NOT NULL 
            AND sc.original_url <> ''
            
            AND COALESCE(sc.published_date, sc.created_at) >= NOW() - INTERVAL '30 days'
            ORDER BY COALESCE(sc.published_date, sc.created_at) DESC 
            LIMIT 3`
        );
        
        if (regRes.rows.length > 0) {
            const regText = regRes.rows.map(r => 
                `---\nREGULATORIK/FÖRDERUNG: ${r.title}\nINHALT: ${r.summary}\n[QUELL-URL: ${r.original_url}]`
            ).join('\n');
            dataBlocks.push(`## NEUE FÖRDERUNGEN & GESETZESÄNDERUNGEN:\n${regText}`);
        }

    } catch (err) {
        console.error(`[Briefing Service] Fehler beim Aggregieren für BP ${partner.id}:`, err);
    }

    return dataBlocks.join('\n\n');
}

async function generateEditorialBriefing(jobId, partner, rawDataText) {
    // OPTIMIERT: Der Prompt erzwingt jetzt striktes Copy-Paste der URLs und trennt Instruktionen von Daten.
    const promptTemplate = `
DU BIST DER CHEFREDAKTEUR EINES EXECUTIVE-BRIEFINGS FÜR DEN BUSINESS PARTNER "${partner.name}".
Deine Aufgabe ist es, aus den untenstehenden Rohdaten ein präzises, strategisches Briefing zu erstellen.

ZIELGRUPPE: Führungskräfte im Bereich Mobilität & Fuhrpark.
SPRACHE: Professionell, direkt, handlungsorientiert (Deutsch).

### STRIKTE REGELN ZUR QUELLENANGABE (TRACEABILITY)
Jeder erstellte Insight MUSS nachvollziehbar sein. 
Suche im Text nach dem Tag "[QUELL-URL: <url>]". 
Kopiere diese URL exakt 1:1 in das "sources" Array. Erfinde niemals eigene URLs. 
Hat ein Insight keine URL, darf er nicht verwendet werden.

### INHALTS-MIX:
1. EXAKT ZWEI (2) "top_insights" müssen aus dem Bereich "RELEVANTE NEWS" stammen.
2. MAXIMAL EIN (1) "top_insight" darf aus "WIRTSCHAFTSDATEN" stammen.
3. REGULATORIK: Nur füllen, wenn echte Daten unter "NEUE FÖRDERUNGEN" stehen. Sonst leeres Array [].
4. EVENTS: Nutze "recommended_actions" für Event-Teaser (z.B. "Besuchen Sie das Event X."). Events sind keine Top-Insights!

### GEFORDERTE JSON-STRUKTUR (Nur das JSON zurückgeben!):
{
  "top_insights": [
    {
      "title": "Kurze Headline",
      "what_changed": "Faktische Zusammenfassung in 2 Sätzen.",
      "so_what": "Warum ist das strategisch wichtig?",
      "action": "Was sollte der Leser jetzt tun?",
      "sources": ["EXAKTE_URL_HIER_EINFÜGEN"]
    }
  ],
  "regulation_and_funding": [
    {
      "title": "Titel der Förderung/Gesetz",
      "summary": "Kurze Erklärung",
      "action": "Handlungsempfehlung",
      "sources": ["EXAKTE_URL_HIER_EINFÜGEN"]
    }
  ],
  "recommended_actions": [
    "Handlungsempfehlung 1 (z.B. Event-Besuch)",
    "Handlungsempfehlung 2"
  ]
}

### ROHDATEN FÜR DAS BRIEFING:
{{data}}
`;

    try {
        const { aiResultString } = await generateAIContent({
            promptTemplate,
            inputText: rawDataText,
            ai_provider: 'OpenAI GPT-4o',
            jobId: jobId,
            userId: null,
            responseFormat: { type: "json_object" } // <-- Das zwingt OpenAI, sauberes JSON zu liefern
        });

        // OPTIMIERT: Robusteres JSON-Cleaning
        // Sucht die erste '{' und die letzte '}', um jeglichen Text (wie Markdown-Ticks oder Einleitungen) abzuschneiden.
        const firstBrace = aiResultString.indexOf('{');
        const lastBrace = aiResultString.lastIndexOf('}');
        
        if (firstBrace === -1 || lastBrace === -1) {
            throw new Error("KI hat kein valides JSON-Objekt zurückgegeben.");
        }
        
        const jsonString = aiResultString.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonString);

    } catch (err) {
        console.error(`[Briefing Service] Fehler bei der KI-Generierung für BP ${partner.id}:`, err.message);
        throw err; // Weiterwerfen, damit processPartnerBriefing den Fehler fängt
    }
}

async function processPartnerBriefing(client, partner, jobId) {
    const freqConfig = getFrequencyConfig(partner.briefing_frequency);
    
    const rawDataText = await aggregateDataForPartner(client, partner, freqConfig);
    if (!rawDataText.trim()) {
        await logToDb(jobId, 'WARN', `Keine relevanten Daten für Partner ${partner.name} gefunden.`);
        return;
    }

    try {
        const briefingJson = await generateEditorialBriefing(jobId, partner, rawDataText);
        const initialStatus = partner.auto_approve_briefings ? 'published' : 'draft';
        
        await client.query(`DELETE FROM business_partner_intelligence_briefings WHERE business_partner_id = $1 AND status = 'draft'`, [partner.id]);

        const insertQuery = `
            INSERT INTO business_partner_intelligence_briefings 
            (business_partner_id, briefing_type, headline, analysis_summary, prognosis, talking_point, related_articles, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        // Insights einfügen (mit Validierung der Quellen)
        for (const insight of (briefingJson.top_insights || [])) {
            // Sicherstellen, dass sources immer ein valides JSON-Array ist
            const sourcesArray = Array.isArray(insight.sources) ? insight.sources : [];
            await client.query(insertQuery, [
                partner.id, 'top_insight', insight.title, insight.what_changed, insight.so_what, insight.action, JSON.stringify(sourcesArray), initialStatus
            ]);
        }

        for (const reg of (briefingJson.regulation_and_funding || [])) {
            const sourcesArray = Array.isArray(reg.sources) ? reg.sources : [];
            await client.query(insertQuery, [
                partner.id, 'regulation', reg.title, reg.summary, null, reg.action, JSON.stringify(sourcesArray), initialStatus
            ]);
        }

        for (const action of (briefingJson.recommended_actions || [])) {
            await client.query(insertQuery, [
                partner.id, 'action_plan', action, null, null, null, '[]', initialStatus
            ]);
        }

        await logToDb(jobId, 'SUCCESS', `Briefing für ${partner.name} erfolgreich generiert (Status: ${initialStatus}).`);
    } catch (err) {
        await logToDb(jobId, 'ERROR', `Verarbeitung für Partner ${partner.name} abgebrochen: ${err.message}`);
    }
}


exports.generateBriefingsForAllPartners = async (targetBpId = null) => {
    let client;
    let jobId;

    try {
        client = await db.connect();
        const jobResult = await client.query(`INSERT INTO ai_jobs (status, is_automated) VALUES ('running', true) RETURNING id`);
        jobId = jobResult.rows[0].id;

        await logToDb(jobId, 'INFO', `Starte Briefing-Generierung. Target BP: ${targetBpId || 'ALLE'}`);

        let query = `SELECT id, name, briefing_frequency, auto_approve_briefings FROM business_partners WHERE is_active = TRUE AND briefing_frequency != 'never'`;
        const params = [];

        if (targetBpId) {
            query += ` AND id = $1::uuid`;
            params.push(targetBpId);
        }

        const bpRes = await client.query(query, params);
        
        for (const partner of bpRes.rows) {
            await processPartnerBriefing(client, partner, jobId);
        }

        await client.query(`UPDATE ai_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);

    } catch (err) {
        console.error('[Briefing Service] Schwerwiegender Fehler im Batch-Lauf:', err);
        if (jobId && client) {
            await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
            await logToDb(jobId, 'ERROR', `Kritischer Fehler: ${err.message}`);
        }
    } finally {
        if (client) client.release();
    }
};