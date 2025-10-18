// backend/services/marketBriefingService.js
const db = require('../config/db');
const { generateAIContent, logToDb } = require('./aiExecutionService');
const { sendEmail } = require('./emailService');
const { renderBriefingEmail } = require('./emailTemplates');


function cleanAndParseJson(aiResponse) {
    const startIndex = aiResponse.indexOf('{');
    const endIndex = aiResponse.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
        throw new Error("Kein valides JSON-Objekt in der KI-Antwort gefunden.");
    }
    
    const jsonString = aiResponse.substring(startIndex, endIndex + 1);
    
    try {
        return JSON.parse(jsonString);
    } catch (parseError) {
        console.error("Fehler beim Parsen des bereinigten JSON-Strings:", jsonString);
        throw new Error("Die KI-Antwort konnte auch nach der Bereinigung nicht als JSON geparst werden.");
    }
}


async function aggregateDataForPartner(partner) {
    let dataBlocks = [];
    let nextEvent = null; // NEU: Variable für das nächste Event
    const client = await db.connect();
    try {
        const industryNames = partner.industries.map(ind => ind.name);
        if (industryNames.length === 0) return { dataBlocksString: '', nextEvent: null };

        const industryPatterns = industryNames.map(name => `${name}%`);
        const matchingCategoriesRes = await client.query(
            `SELECT id FROM categories WHERE name LIKE ANY($1::text[])`,
            [industryPatterns]
        );
        const allRelevantCategoryIds = matchingCategoriesRes.rows.map(r => r.id);

        if (allRelevantCategoryIds.length === 0) {
            console.log(`[BriefingService] Keine passenden Content-Kategorien für die Branchen ${industryNames.join(', ')} gefunden.`);
            return { dataBlocksString: '', nextEvent: null };
        }

        const indicatorsRes = await client.query(
            `SELECT indicator_name, value, unit FROM economic_indicators 
             WHERE indicator_name IN ('BRENT_OIL', 'EUR_USD') 
             ORDER BY data_timestamp DESC LIMIT 2`
        );
        if (indicatorsRes.rows.length > 0) {
            dataBlocks.push('## Wirtschaftsdaten:\n' + indicatorsRes.rows.map(r => `- ${r.indicator_name}: ${r.value} ${r.unit}`).join('\n'));
        }

        const newsRes = await client.query(
            `SELECT title, summary FROM scraped_content 
             WHERE category_id = ANY($1::uuid[]) AND published_date >= NOW() - INTERVAL '3 days' 
             ORDER BY published_date DESC, relevance_score DESC LIMIT 5`,
            [allRelevantCategoryIds]
        );
        if (newsRes.rows.length > 0) {
            dataBlocks.push('## Aktuelle Branchen-News:\n' + newsRes.rows.map(r => `- ${r.title}: ${r.summary}`).join('\n'));
        }

        const partnerRegionsRes = await client.query('SELECT r.name FROM regions r JOIN business_partner_regions bpr ON r.id = bpr.region_id WHERE bpr.business_partner_id = $1', [partner.id]);
        const partnerRegions = partnerRegionsRes.rows.map(r => r.name);
        if (partnerRegions.length > 0) {
            // ANGEPASST: original_url wird jetzt auch abgefragt
            const eventsRes = await client.query(
                `SELECT title, event_date, region, original_url FROM scraped_content 
                 WHERE event_date > NOW() AND region = ANY($1::text[]) 
                 ORDER BY event_date ASC LIMIT 3`,
                [partnerRegions]
            );
            if (eventsRes.rows.length > 0) {
                dataBlocks.push('## Kommende Events:\n' + eventsRes.rows.map(r => `- ${new Date(r.event_date).toLocaleDateString('de-DE')}: ${r.title} (${r.region})`).join('\n'));
                nextEvent = eventsRes.rows[0]; // NEU: Das erste Event speichern
            }
        }

        if (partner.dashboard_focus === 'sales') {
            const intelligenceRes = await client.query(
                `SELECT bpa.name as account_name, bpta.article_title, bpta.competitor_name 
                 FROM business_partner_tracked_articles bpta
                 JOIN business_partner_accounts bpa ON bpta.account_id = bpa.id
                 WHERE bpa.business_partner_id = $1 AND bpta.created_at >= NOW() - INTERVAL '3 days'
                 ORDER BY bpta.created_at DESC LIMIT 10`,
                [partner.id]
            );
            if (intelligenceRes.rows.length > 0) {
                dataBlocks.push('## Aktivitäten zu betreuten Kunden & Wettbewerbern:\n' + intelligenceRes.rows.map(r => {
                    return r.competitor_name ? `- Wettbewerber "${r.competitor_name}" (von Kunde ${r.account_name}): ${r.article_title}` : `- Kunde "${r.account_name}": ${r.article_title}`;
                }).join('\n'));
            }
        }
    } finally {
        client.release();
    }
    
    // ANGEPASST: Objekt statt String zurückgeben
    return {
        dataBlocksString: dataBlocks.join('\n\n'),
        nextEvent: nextEvent
    };
}

function createMasterPrompt(aggregatedData, partner) {
    const industryNames = partner.industries.map(ind => `'${ind.name}'`).join(' und ');

    const marketBriefingPrompt = `
      TEIL 1: MARKT-BRIEFING
      Du bist ein Analyst für die Branchen ${industryNames}. Analysiere die folgenden Rohdaten. Achte besonders auf Überschneidungen und Abhängigkeiten zwischen den Sektoren.
      1. Erstelle eine prägnante, reißerische Schlagzeile für den heutigen Tag.
      2. Fasse die wichtigsten Entwicklungen in 2-3 Sätzen zusammen.
      3. Gib eine kurze Prognose für die kommenden Tage/Wochen ab.
    `;

    const salesTriggerPrompt = `
      TEIL 2: SALES TRIGGER
      Analysiere dieselben Daten erneut. Identifiziere für die im Abschnitt "Aktivitäten zu betreuten Kunden & Wettbewerbern" genannten Kunden konkrete Gesprächsanlässe ("Sales Trigger").
      Für jeden gefundenen Trigger, erstelle ein Objekt mit:
      - "account_name": Der exakte Name des Kunden.
      - "headline": Eine kurze, klare Schlagzeile für den Trigger (z.B. "Chance: Wettbewerber erhöht Preise").
      - "analysis": 1-2 Sätze, die die Situation und die Chance/das Risiko erklären.
      - "talking_point": Ein konkreter, wörtlicher Vorschlag für einen Gesprächseinstieg.
    `;

    const jsonStructure = `
      ANTWORTFORMAT:
      Gib deine Antwort AUSSCHLIESSLICH als ein einziges, valides JSON-Objekt zurück.
      Struktur:
      {
        "market_briefing": { "headline": "...", "summary": "...", "prognosis": "..." },
        "sales_triggers": [ { "account_name": "...", "headline": "...", "analysis": "...", "talking_point": "..." } ]
      }
      Wenn du für einen Teil keine relevanten Informationen findest, gib einen leeren String oder ein leeres Array zurück.
    `;

    const finalPrompt = `
      ${partner.dashboard_focus === 'sales' ? marketBriefingPrompt + salesTriggerPrompt : marketBriefingPrompt}
      ${jsonStructure}
      
      HIER SIND DIE ROHDATEN:
      ---
      ${aggregatedData}
      ---
    `;
    return finalPrompt;
}

async function generateBriefingsForAllPartners() {
    console.log('[BriefingService] Starte die Generierung der Tages-Briefings für alle Partner...');
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
                console.log(`[BriefingService] Keine Branchen für Partner ${partner.id} konfiguriert. Überspringe.`);
                continue;
            }
            
            console.log(`[BriefingService] Verarbeite Partner: ${partner.id} (${partner.industries.map(i => i.name).join(', ')})`);

            let jobId;
            try {
                const jobRes = await client.query(`INSERT INTO ai_jobs (status, is_automated) VALUES ('running', TRUE) RETURNING id`);
                jobId = jobRes.rows[0].id;

                await logToDb(jobId, 'INFO', `Starte Briefing-Generierung für Partner ${partner.id}.`);

                // ANGEPASST: Destrukturierung des neuen Rückgabeobjekts
                const { dataBlocksString, nextEvent } = await aggregateDataForPartner(partner);
                
                if (!dataBlocksString) {
                    await logToDb(jobId, 'SUCCESS', `Keine relevanten Daten für Partner ${partner.id} gefunden. Job beendet.`);
                    await client.query(`UPDATE ai_jobs SET status = 'completed_no_results' WHERE id = $1`, [jobId]);
                    continue;
                }

                const masterPrompt = createMasterPrompt(dataBlocksString, partner);

                const { aiResultString } = await generateAIContent({
                    promptTemplate: masterPrompt,
                    inputText: '',
                    ai_provider: 'OpenAI GPT-4o',
                    jobId: jobId
                });
                
                const analysisResult = cleanAndParseJson(aiResultString);
                
                await client.query('BEGIN');

                if (analysisResult.market_briefing) {
                    const mb = analysisResult.market_briefing;
                    await client.query(
                        `INSERT INTO business_partner_intelligence_briefings 
                         (business_partner_id, briefing_type, headline, analysis_summary, prognosis)
                         VALUES ($1, 'market', $2, $3, $4)`,
                        [partner.id, mb.headline, mb.summary, mb.prognosis]
                    );
                }

                if (partner.dashboard_focus === 'sales' && analysisResult.sales_triggers && Array.isArray(analysisResult.sales_triggers)) {
                    for (const st of analysisResult.sales_triggers) {
                        const accRes = await client.query('SELECT id FROM business_partner_accounts WHERE name = $1 AND business_partner_id = $2', [st.account_name, partner.id]);
                        if (accRes.rows.length > 0) {
                            const accountId = accRes.rows[0].id;
                            await client.query(
                                `INSERT INTO business_partner_intelligence_briefings
                                 (business_partner_id, briefing_type, account_id, headline, analysis_summary, talking_point)
                                 VALUES ($1, 'account_specific', $2, $3, $4, $5)`,
                                [partner.id, accountId, st.headline, st.analysis, st.talking_point]
                            );
                        }
                    }
                }
                await client.query('COMMIT');
                
                await logToDb(jobId, 'SUCCESS', `Briefing für Partner ${partner.id} erfolgreich gespeichert.`);
                await client.query(`UPDATE ai_jobs SET status = 'completed' WHERE id = $1`, [jobId]);

                const { rows: subscribers } = await client.query(
                    `SELECT email, username FROM users 
                     WHERE business_partner_id = $1 AND newsletter_opt_in = TRUE AND is_active = TRUE`,
                    [partner.id]
                );

                if (subscribers.length > 0 && analysisResult.market_briefing) {
                    console.log(`[BriefingService] Versende ${subscribers.length} Briefing-E-Mails für Partner ${partner.id}`);
                    
                    // VEREINHEITLICHUNG (ANGEPASST):
                    // Das nächste Event wird nun an die Template-Funktion übergeben.
                    const emailBody = renderBriefingEmail({
                        briefing: analysisResult,
                        brandLogoUrl: partner.logo_url,
                        dashboardTitle: partner.dashboard_title,
                        nextEvent: nextEvent // <-- HINZUGEFÜGT
                    });

                    for (const subscriber of subscribers) {
                        await sendEmail({
                            to: subscriber.email,
                            subject: `Ihr Tägliches Briefing: ${analysisResult.market_briefing.headline}`,
                            html: emailBody,
                            fromName: partner.dashboard_title || 'Ihr KI-Dashboard'
                        });
                    }
                }

            } catch (err) {
                console.error(`[BriefingService] Fehler beim Verarbeiten von Partner ${partner.id}:`, err.message);
                if (jobId) {
                    await logToDb(jobId, 'ERROR', `Job mit kritischem Fehler abgebrochen: ${err.message}`);
                    await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
                }
            }
        }
    } catch (err) {
        console.error('[BriefingService] Kritischer Fehler beim Laden der Partner:', err.message, err.stack);
    } finally {
        client.release();
    }
}

module.exports = {
    generateBriefingsForAllPartners,
};