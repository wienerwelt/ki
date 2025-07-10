// backend/services/scraperService.js
const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
// KORRIGIERT: Notwendige Importe aus date-fns
const { parse } = require('date-fns');
const { de } = require('date-fns/locale'); // NEU: Import des deutschen Sprachpakets
const db = require('../config/db');
const { logActivity } = require('./auditLogService');
const { callOpenAI } = require('./aiService');

// ===================================================================================
// HELPER-FUNKTIONEN
// ===================================================================================

const logToDb = async (jobId, level, message) => {
    if (!jobId) return;
    try {
        await db.query(`INSERT INTO scraping_logs (job_id, log_level, message) VALUES ($1, $2, $3)`, [jobId, level, message]);
    } catch (dbError) {
        console.error(`FATAL: Could not write log to DB for jobId ${jobId}:`, dbError);
    }
};

// KORRIGIERT: Die parse-Funktion verwendet jetzt das deutsche Sprachpaket
const parseDateString = (dateString, dateFormat, jobId) => {
    if (!dateString) return null;
    try {
        // Wenn ein Format angegeben ist, verwende es mit dem deutschen Locale
        const parsedDate = dateFormat 
            ? parse(dateString, dateFormat, new Date(), { locale: de }) 
            : new Date(dateString);

        if (parsedDate instanceof Date && !isNaN(parsedDate.getTime())) {
            return parsedDate;
        }
        logToDb(jobId, 'WARN', `Ungültiges Datumsformat im Feed erkannt: "${dateString}"`);
        return null;
    } catch (error) {
        logToDb(jobId, 'ERROR', `Fehler beim Parsen des Datums "${dateString}": ${error.message}`);
        return null;
    }
};

const sanitizeHtml = (htmlString) => {
    if (!htmlString) return null;
    return cheerio.load(htmlString).text();
};

const extractTags = (text, availableTags) => {
    if (!text || !availableTags) return [];
    const foundTagIds = new Set();
    const lowercasedText = text.toLowerCase();
    availableTags.forEach(tag => {
        if (lowercasedText.includes(tag.name.toLowerCase())) {
            foundTagIds.add(tag.id);
        }
    });
    return Array.from(foundTagIds);
};

// ===================================================================================
// INTERNE SCRAPING-LOGIK
// ===================================================================================

async function _extractDataFromHtml(htmlContent, url) {
    try {
        const dom = new JSDOM(htmlContent, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article && article.textContent) {
            return {
                title: article.title,
                textContent: article.textContent.replace(/\s\s+/g, ' ').trim()
            };
        }
        throw new Error('Readability konnte keinen Artikelinhalt finden.');
    } catch (error) {
        throw new Error(`Fehler bei der HTML-Verarbeitung: ${error.message}`);
    }
}

async function _processXmlFeedByRule(xmlContent, rule, jobId, availableTags) {
    const { source_identifier: sourceIdentifier, region: ruleRegion, id: ruleId, date_format: dateFormat, category_default } = rule;
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    const result = await parser.parseStringPromise(xmlContent);
    const items = result.rss?.channel?.item || result.feed?.entry || [];
    const feedItems = Array.isArray(items) ? items : [items];
    let itemsInserted = 0;

    await logToDb(jobId, 'INFO', `Verarbeite ${feedItems.length} Einträge für Regel '${sourceIdentifier}'.`);

    for (const item of feedItems) {
        if (sourceIdentifier.includes('traffic')) {
            const title = item.title || 'Unbekannte Meldung';
            const link = item.link?.href || item.link || null;
            const guid = item.guid?._ || item.guid || link;
            if (!guid) continue;
            
            const result = await db.query(
                `INSERT INTO traffic_incidents (title, description, link, published_at, road_name, region, type, source_identifier, scraping_rule_id, original_item_guid)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (link) DO UPDATE SET description = EXCLUDED.description, published_at = EXCLUDED.published_at, title = EXCLUDED.title;`,
                [title, item.description || null, link, parseDateString(item.pubDate || item.updated, dateFormat, jobId), title.split(',')[0], ruleRegion, 'Stau', sourceIdentifier, ruleId, guid]
            );
            if(result.rowCount > 0) itemsInserted++;

        } else {
            const link = item.link?.href || item.link || null;
            if (!link) continue;

            const cleanTitle = sanitizeHtml(item.title?._ || item.title || 'Kein Titel');
            const cleanDescription = sanitizeHtml(item.description?._ || item.summary?._ || item.description || item.summary || null);
            const foundTagIds = extractTags(`${cleanTitle} ${cleanDescription}`, availableTags);
            const parsedDate = parseDateString(item.pubDate || item.updated, dateFormat, jobId);

            const contentResult = await db.query(
                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, event_date, category, region)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (original_url) DO NOTHING RETURNING id;`,
                [sourceIdentifier, link, cleanTitle, cleanDescription, category_default === 'event' ? null : parsedDate, category_default === 'event' ? parsedDate : null, category_default, ruleRegion]
            );
            
            if (contentResult.rowCount > 0) {
                itemsInserted++;
                const scrapedContentId = contentResult.rows[0].id;
                if (foundTagIds.length > 0) {
                    for (const tagId of foundTagIds) {
                        await db.query(`INSERT INTO scraped_content_tags (scraped_content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [scrapedContentId, tagId]);
                    }
                }
            }
        }
    }
    return itemsInserted;
}

// ===================================================================================
// EXPORTIERTE HAUPTFUNKTIONEN
// ===================================================================================

async function triggerSingleRuleScrape(ruleId, jobId) {
    let itemsProcessed = 0;
    try {
        await db.query(`UPDATE scraping_jobs SET status = 'running' WHERE id = $1`, [jobId]);
        const ruleResult = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [ruleId]);
        if (ruleResult.rows.length === 0) throw new Error(`Scraping-Regel mit ID ${ruleId} nicht gefunden.`);
        
        const rule = ruleResult.rows[0];
        const tagsResult = await db.query('SELECT id, name FROM tags');
        const availableTags = tagsResult.rows;

        const response = await axios.get(rule.url_pattern, { timeout: 15000 });
        const contentType = response.headers['content-type'] || '';

        if (contentType.includes('xml') || contentType.includes('rss')) {
             itemsProcessed = await _processXmlFeedByRule(response.data, rule, jobId, availableTags);
        } else if (contentType.includes('html')) {
            if (rule.content_container_selector && rule.link_selector) {
                await logToDb(jobId, 'INFO', `Quelle als HTML-Liste erkannt. Analysiere Seite für Regel '${rule.source_identifier}'.`);
                const $ = cheerio.load(response.data);
                const articleContainers = $(rule.content_container_selector);
                await logToDb(jobId, 'INFO', `${articleContainers.length} mögliche Artikel-Container gefunden. Verarbeite jeden...`);

                for (const container of articleContainers) {
                    const element = $(container);
                    const linkElement = element.find(rule.link_selector);
                    let articleUrl = linkElement.attr('href');

                    if (!articleUrl) {
                        await logToDb(jobId, 'WARN', `Kein Link im Container gefunden (Selektor: ${rule.link_selector}). Container wird übersprungen.`);
                        continue;
                    }
                    try {
                        articleUrl = new URL(articleUrl, rule.url_pattern).href;
                    } catch (e) {
                        await logToDb(jobId, 'WARN', `Ungültiger Link gefunden: ${articleUrl}. Container wird übersprungen.`);
                        continue;
                    }

                    const title = rule.title_selector ? element.find(rule.title_selector).text().trim() : 'Kein Titel';
                    const summary = rule.description_selector ? element.find(rule.description_selector).text().trim() : null;
                    const dateString = rule.date_selector ? element.find(rule.date_selector).text().trim() : null;
                    const parsedDate = parseDateString(dateString, rule.date_format, jobId);
                    const foundTagIds = extractTags(`${title} ${summary}`, availableTags);

                    const contentResult = await db.query(
                        `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, event_date, category, region)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (original_url) DO NOTHING RETURNING id;`,
                        [rule.source_identifier, articleUrl, title, summary, rule.category_default === 'event' ? null : parsedDate, rule.category_default === 'event' ? parsedDate : null, rule.category_default, rule.region]
                    );

                    if (contentResult.rowCount > 0) {
                        itemsProcessed++;
                        const newContentId = contentResult.rows[0].id;
                        if (foundTagIds.length > 0) {
                            for (const tagId of foundTagIds) {
                                await db.query(`INSERT INTO scraped_content_tags (scraped_content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [newContentId, tagId]);
                            }
                        }
                    }
                }
            } else {
                await logToDb(jobId, 'INFO', `Quelle als einzelne HTML-Seite erkannt. Extrahiere Textinhalt für Regel '${rule.source_identifier}'.`);
                const { title, textContent } = await _extractDataFromHtml(response.data, rule.url_pattern);

                if (textContent) {
                    const contentResult = await db.query(
                        `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, category, region)
                         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6) ON CONFLICT (original_url) DO NOTHING RETURNING id;`,
                        [rule.source_identifier, rule.url_pattern, title, textContent, rule.category_default, rule.region]
                    );

                    if (contentResult.rowCount > 0) {
                        itemsProcessed = 1;
                        await logToDb(jobId, 'INFO', `HTML-Inhalt von '${rule.url_pattern}' erfolgreich verarbeitet und gespeichert.`);
                    } else {
                        await logToDb(jobId, 'INFO', `Inhalt von '${rule.url_pattern}' existiert bereits in der Datenbank.`);
                    }
                } else {
                     await logToDb(jobId, 'WARN', `Konnte keinen Textinhalt aus der HTML-Seite '${rule.url_pattern}' extrahieren.`);
                }
            }
        } else {
            throw new Error(`Nicht unterstützter Inhaltstyp für regelbasiertes Scraping: ${contentType}.`);
        }
        
        await logToDb(jobId, 'INFO', `Zusammenfassung: ${itemsProcessed} neue Inhalte wurden erfolgreich gescrapt und in die Datenbank eingefügt.`);
        
        await db.query('UPDATE scraping_rules SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = $1', [ruleId]);
        await db.query(`UPDATE scraping_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
        await logToDb(jobId, 'INFO', 'Job erfolgreich abgeschlossen.');
    } catch(err) {
        await logToDb(jobId, 'ERROR', `Job mit kritischem Fehler abgebrochen: ${err.message}`);
        await db.query(`UPDATE scraping_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
    }
}

async function startAllScrapingJobs() {
    console.log(`[Scraper] Starting all scheduled scraping jobs...`);
    try {
        const rulesResult = await db.query(`SELECT * FROM scraping_rules WHERE is_active = TRUE`);
        for (const rule of rulesResult.rows) {
            const jobResult = await db.query(`INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`, [rule.id]);
            const jobId = jobResult.rows[0].id;
            triggerSingleRuleScrape(rule.id, jobId).catch(err => console.error(`Error in background scrape for rule ${rule.id}:`, err.message));
        }
        console.log('[Scraper] All scheduled scraping jobs cycle completed.');
    } catch (error) {
        console.error('[Scraper] Critical error during scraping setup:', error.message);
    }
}

async function getScrapingRuleSuggestion(url, userId) {
    console.log(`[Intelligent-Selector-AI] Starte Analyse für URL: ${url}`);
    
    await logActivity({
        userId,
        actionType: 'AI_SUGGEST_SCRAPING_RULES',
        status: 'info',
        details: { url, message: 'Analyse gestartet.' }
    });

    let rawContent;
    let model;
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 15000,
            responseType: 'text'
        });
        rawContent = response.data;
    } catch (error) {
        await logActivity({
            userId,
            actionType: 'AI_SUGGEST_SCRAPING_RULES',
            status: 'failure',
            details: { url, error: error.message }
        });
        console.error(`[Intelligent-Selector-AI] Fehler beim Abrufen der URL ${url}:`, error.message);
        throw new Error(`Konnte die URL nicht abrufen. Status: ${error.response?.status || 'Netzwerkfehler'}`);
    }

    const prompt = `
        Du bist ein Experte für Datenextraktion. Deine Aufgabe ist es, den folgenden Webinhalt zu analysieren, sein Format (HTML, RSS, Atom XML) zu erkennen und Regeln zur Extraktion einer LISTE VON ARTIKELN vorzuschlagen.

        ANWEISUNGEN:
        1.  FORMAT ERKENNEN: Identifiziere das Format. Mögliche Werte sind: 'html', 'rss', 'atom'.
        2.  REGELN VORSCHLAGEN:
            * Wenn Format 'html': Finde die CSS-Selektoren für eine Artikelliste.
                - \`content_container_selector\`: Der CSS-Selektor, der JEDEN EINZELNEN Artikel in der Liste umschließt.
                - \`title_selector\`: Der CSS-Selektor für den Titel, relativ zum Container.
                - \`date_selector\`: Der CSS-Selektor für das Datum, relativ zum Container.
                - \`description_selector\`: Der CSS-Selektor für den Teaser-Text, relativ zum Container.
                - \`link_selector\`: Der CSS-Selektor für den Link ('<a>'-Tag) zur Detailseite, relativ zum Container.
            * Wenn Format 'rss' oder 'atom': Gib eine Standardnachricht aus.
        3.  ANTWORTFORMAT: Gib deine Antwort NUR als valides JSON-Objekt zurück.
            * Wenn du das Format absolut nicht bestimmen kannst, antworte so:
              \`\`\`json
              { "format": "unknown", "rules": { "message": "Das Format der Seite konnte nicht automatisch erkannt werden." } }
              \`\`\`

        HIER IST DER ZU ANALYSIERENDE INHALT (max. 40000 Zeichen):
        \`\`\`
        ${rawContent.substring(0, 40000)}
        \`\`\`
    `;

    let aiResponseContent = '';
    try {
        model = 'gpt-3.5-turbo';
        const { content, usage } = await callOpenAI(prompt, model);
        aiResponseContent = content;

        if (!aiResponseContent || aiResponseContent.trim() === '') {
            throw new Error('Die KI hat eine leere Antwort zurückgegeben.');
        }
        
        const cleanedContent = aiResponseContent.replace(/```json\n?/, '').replace(/```/, '').trim();
        const suggestion = JSON.parse(cleanedContent);

        if (!suggestion || !suggestion.format || !suggestion.rules) {
            console.error('[Intelligent-Selector-AI] Ungültige JSON-Struktur von der KI:', suggestion);
            throw new Error('Die KI hat eine Antwort mit einer ungültigen Struktur zurückgegeben.');
        }

        await logActivity({
            userId,
            actionType: 'AI_SUGGEST_SCRAPING_RULES',
            status: 'success',
            details: { url, model, tokenUsage: usage, format: suggestion.format }
        });

        console.log(`[Intelligent-Selector-AI] Erfolgreich Vorschläge für ${url} erhalten.`);
        return suggestion;

    } catch (error) {
        await logActivity({
            userId,
            actionType: 'AI_SUGGEST_SCRAPING_RULES',
            status: 'failure',
            details: { url, model: model || 'N/A', error: error.message, rawApiResponse: aiResponseContent }
        });
        console.error(`[Intelligent-Selector-AI] Fehler bei der KI-Analyse:`, error.message);
        throw new Error(`Fehler bei der KI-Analyse: ${error.message}`);
    }
}

module.exports = {
    triggerSingleRuleScrape,
    startAllScrapingJobs,
    getScrapingRuleSuggestion,
};
