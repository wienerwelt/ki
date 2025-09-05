// backend/services/scraperService.js
const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { parse } = require('date-fns');
const { de } = require('date-fns/locale');
const db = require('../config/db');
const { logActivity } = require('./auditLogService');
const { callOpenAI } = require('./aiService');
const { scrapeQueue } = require('./queueService');

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

const parseDateString = (dateString, dateFormat, jobId) => {
    if (!dateString) return null;
    const trimmedDate = dateString.trim();

    try {
        // 1. Bevorzugte Methode: Wenn ein Format in der Regel definiert ist, nutze es.
        if (dateFormat) {
            const parsed = parse(trimmedDate, dateFormat, new Date(), { locale: de });
            if (!isNaN(parsed.getTime())) return parsed;
        }

        // 2. NEU: Versuche, das Standard-RSS-Format (RFC 822) zu parsen.
        // Das Format ist z.B. "Tue, 26 Aug 2025 17:20:00 +0200"
        try {
            const rssFormat = "EEE, dd MMM yyyy HH:mm:ss xx";
            const parsedRss = parse(trimmedDate, rssFormat, new Date(), { locale: de });
            if (!isNaN(parsedRss.getTime())) return parsedRss;
        } catch (e) { /* Ignorieren und mit der nächsten Methode weitermachen */ }

        // 3. Letzter Ausweg: Der ursprüngliche, unzuverlässige new Date() Konstruktor.
        const fallbackParsed = new Date(trimmedDate);
        if (!isNaN(fallbackParsed.getTime())) return fallbackParsed;

        // 4. Wenn alles fehlschlägt, gib eine Warnung aus.
        logToDb(jobId, 'WARN', `Ungültiges Datumsformat im Feed erkannt: "${trimmedDate}"`);
        return null;

    } catch (error) {
        logToDb(jobId, 'ERROR', `Fehler beim Parsen des Datums "${trimmedDate}": ${error.message}`);
        return null;
    }
};

const sanitizeHtml = (htmlString) => {
    if (!htmlString) return null;
    return cheerio.load(htmlString).text();
};

// Hilfsfunktion, um Sonderzeichen in Tag-Namen für Regex sicher zu machen
const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const extractTags = (text, availableTags) => {
    if (!text || !availableTags) return [];
    const foundTagIds = new Set();

    availableTags.forEach(tag => {
        // 1. Tag-Namen für die Verwendung in Regex "escapen"
        const escapedTagName = escapeRegex(tag.name);

        // 2. Regex erstellen, das nach dem ganzen Wort sucht (\b) und Groß-/Kleinschreibung ignoriert (i)
        const regex = new RegExp(`\\b${escapedTagName}\\b`, 'i');

        // 3. Prüfen, ob der Text das Pattern enthält
        if (regex.test(text)) {
            foundTagIds.add(tag.id);
        }
    });
    return Array.from(foundTagIds);
};

// ===================================================================================
// INTERNE SCRAPING-LOGIK
// ===================================================================================

async function _processYoutubeChannel(rule, jobId) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
        await logToDb(jobId, 'ERROR', 'YouTube API Key ist nicht in der .env-Datei konfiguriert.');
        throw new Error('YouTube API Key not configured.');
    }

    const channelUrl = rule.url_pattern;
    const channelIdMatch = channelUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
    if (!channelIdMatch || !channelIdMatch[1]) {
        await logToDb(jobId, 'ERROR', `Ungültige YouTube-Kanal-URL: ${channelUrl}`);
        throw new Error('Invalid YouTube Channel URL format.');
    }
    const channelId = channelIdMatch[1];
    
    await logToDb(jobId, 'INFO', `Starte YouTube API Abfrage für Kanal-ID: ${channelId}`);

    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                key: YOUTUBE_API_KEY,
                channelId: channelId,
                part: 'snippet',
                order: 'date',
                maxResults: 20,
                type: 'video'
            }
        });

        const videos = response.data.items;
        if (!videos || videos.length === 0) {
            await logToDb(jobId, 'INFO', 'Keine neuen Videos auf dem Kanal gefunden.');
            return 0;
        }

        const channelTitle = videos[0].snippet.channelTitle; // Kanalnamen aus dem ersten Video extrahieren
        await logToDb(jobId, 'INFO', `${videos.length} Videos vom Kanal "${channelTitle}" gefunden. Speichere in DB...`);
        let itemsInserted = 0;

        for (const video of videos) {
            const videoId = video.id.videoId;
            const snippet = video.snippet;
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

            const contentResult = await db.query(
                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, category, region, thumbnail_url, full_text)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (original_url) DO NOTHING
                 RETURNING id;`,
                [
                    rule.source_identifier,
                    videoUrl,
                    snippet.title,
                    snippet.description,
                    new Date(snippet.publishedAt),
                    rule.category_default,
                    rule.region,
                    snippet.thumbnails.high.url,
                    channelTitle // <-- HIER WIRD DER KANALNAME IN full_text GESPEICHERT
                ]
            );

            if (contentResult.rowCount > 0) {
                itemsInserted++;
            }
        }
        return itemsInserted;

    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        await logToDb(jobId, 'ERROR', `Fehler bei der YouTube API-Anfrage: ${errorMessage}`);
        throw new Error(`YouTube API request failed: ${errorMessage}`);
    }
}



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
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(xmlContent);
    const items = result.rss?.channel?.item || result.feed?.entry || [];
    const feedItems = Array.isArray(items) ? items : [items];
    let itemsInserted = 0;

    await logToDb(jobId, 'INFO', `Verarbeite ${feedItems.length} Einträge für Regel '${sourceIdentifier}'.`);

    for (const item of feedItems) {
        const title = item.title?._ || item.title || 'Kein Titel';
        const parsedDate = parseDateString(item.pubDate || item.updated, dateFormat, jobId);

        // Stichtagsprüfung
        if (rule.scrape_after_date && parsedDate) {
            const cutoffDate = new Date(rule.scrape_after_date);
            cutoffDate.setUTCHours(0, 0, 0, 0);
            if (parsedDate < cutoffDate) {
                await logToDb(jobId, 'INFO', `Feed-Eintrag übersprungen (vor Stichtag ${cutoffDate.toLocaleDateString('de-DE')}): "${title}"`);
                continue;
            }
        }

        if (sourceIdentifier.includes('traffic')) {
            const link = item.link?.href || item.link || null;
            const guid = item.guid?._ || item.guid || link;
            if (!guid) continue;

            const result = await db.query(
                `INSERT INTO traffic_incidents (title, description, link, published_at, road_name, region, type, source_identifier, scraping_rule_id, original_item_guid)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (link) DO UPDATE SET description = EXCLUDED.description, published_at = EXCLUDED.published_at, title = EXCLUDED.title;`,
                [title, item.description || null, link, parsedDate, title.split(',')[0], ruleRegion, 'Stau', sourceIdentifier, ruleId, guid]
            );
            if (result.rowCount > 0) itemsInserted++;
        } else {
let link = null;
// NEU: Zuerst versuchen, den Link über den link_selector zu finden (z.B. für Podcasts)
if (rule.link_selector === 'enclosure.url') {
    link = item.enclosure?.$?.url || null;
}

// Fallback: Wenn der link_selector nicht passt oder leer ist, die alte Methode verwenden (für News-Feeds)
if (!link) {
    link = item.link?.href || item.link || null;
}

if (!link) continue; // Wenn immer noch kein Link da ist, überspringen

            const cleanTitle = sanitizeHtml(title);
            const cleanDescription = sanitizeHtml(item.description?._ || item.summary?._ || item.description || item.summary || null);
            const foundTagIds = extractTags(`${cleanTitle} ${cleanDescription}`, availableTags);

            const contentResult = await db.query(
                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, event_date, category, region)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (original_url) DO NOTHING
                 RETURNING id;`,
                [sourceIdentifier, link, cleanTitle, cleanDescription, category_default === 'event' ? null : parsedDate, category_default === 'event' ? parsedDate : null, category_default, ruleRegion]
            );

            if (contentResult.rowCount > 0) {
                itemsInserted++;
                const scrapedContentId = contentResult.rows[0].id;
                if (foundTagIds.length > 0) {
                    for (const tagId of foundTagIds) {
                        await db.query(
                            `INSERT INTO scraped_content_tags (scraped_content_id, tag_id)
                             VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
                            [scrapedContentId, tagId]
                        );
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

async function extractTextFromUrl(url) {
    if (!url) {
        console.error('extractTextFromUrl wurde ohne URL aufgerufen.');
        return null;
    }
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 20000,
            responseType: 'text'
        });
        const { textContent } = await _extractDataFromHtml(response.data, url);
        return textContent;
    } catch (error) {
        console.error(`Fehler beim Extrahieren des Textes von ${url}:`, error.message);
        return null;
    }
}

// in backend/services/scraperService.js
async function triggerSingleRuleScrape(ruleId, jobId) {
    let itemsProcessed = 0;
    try {
        await db.query(`UPDATE scraping_jobs SET status = 'running' WHERE id = $1`, [jobId]);
        const ruleResult = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [ruleId]);
        if (ruleResult.rows.length === 0) throw new Error(`Scraping-Regel mit ID ${ruleId} nicht gefunden.`);

        const rule = ruleResult.rows[0];
        const tagsResult = await db.query('SELECT id, name FROM tags');
        const availableTags = tagsResult.rows;

        // NEUE LOGIK: Prüfen, ob die URL ein YouTube-Kanal ist
        if (rule.url_pattern && rule.url_pattern.includes('youtube.com/channel/')) {
            itemsProcessed = await _processYoutubeChannel(rule, jobId);
        } else {
            // BESTEHENDE LOGIK für RSS/HTML
            const response = await axios.get(rule.url_pattern, { timeout: 15000 });
            const contentType = response.headers['content-type'] || '';

            if (contentType.includes('xml') || contentType.includes('rss')) {
                itemsProcessed = await _processXmlFeedByRule(response.data, rule, jobId, availableTags);
            } else if (contentType.includes('html')) {
                // Kompletter Block für HTML-Verarbeitung
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

                        if (rule.scrape_after_date && parsedDate) {
                            const cutoffDate = new Date(rule.scrape_after_date);
                            cutoffDate.setUTCHours(0, 0, 0, 0);
                            if (parsedDate < cutoffDate) {
                                await logToDb(jobId, 'INFO', `Artikel übersprungen (vor Stichtag ${cutoffDate.toLocaleDateString('de-DE')}): "${title}"`);
                                continue;
                            }
                        }

                        const foundTagIds = extractTags(`${title} ${summary}`, availableTags);

                        const contentResult = await db.query(
                            `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, event_date, category, region)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                             ON CONFLICT (original_url) DO NOTHING
                             RETURNING id;`,
                            [rule.source_identifier, articleUrl, title, summary, rule.category_default === 'event' ? null : parsedDate, rule.category_default === 'event' ? parsedDate : null, rule.category_default, rule.region]
                        );

                        if (contentResult.rowCount > 0) {
                            itemsProcessed++;
                            const newContentId = contentResult.rows[0].id;
                            if (foundTagIds.length > 0) {
                                for (const tagId of foundTagIds) {
                                    await db.query(
                                        `INSERT INTO scraped_content_tags (scraped_content_id, tag_id)
                                         VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
                                        [newContentId, tagId]
                                    );
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
                             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6)
                             ON CONFLICT (original_url) DO NOTHING
                             RETURNING id;`,
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
        }

        await logToDb(jobId, 'INFO', `Zusammenfassung: ${itemsProcessed} neue Inhalte wurden erfolgreich gescrapt und in die Datenbank eingefügt.`);
        await db.query('UPDATE scraping_rules SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = $1', [ruleId]);
        await db.query(`UPDATE scraping_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
        await logToDb(jobId, 'INFO', 'Job erfolgreich abgeschlossen.');
    } catch (err) {
        await logToDb(jobId, 'ERROR', `Job mit kritischem Fehler abgebrochen: ${err.message}`);
        await db.query(`UPDATE scraping_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
    }
}

async function startAllScrapingJobs() {
    console.log(`[Scraper] Starting all scheduled scraping jobs...`);
    try {
        const rulesResult = await db.query(`SELECT * FROM scraping_rules WHERE is_active = TRUE`);
for (const rule of rulesResult.rows) {
    const jobResult = await db.query(
        `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
        [rule.id]
    );
    const jobId = jobResult.rows[0].id;
    const jobName = rule.name || rule.source_identifier;
    await scrapeQueue.add(
        jobName,
        { ruleId: rule.id, jobId },
        { jobId: `scrape:${rule.id}:${Date.now()}` }
    );
}
        console.log('[Scraper] All scheduled scraping jobs enqueued.');
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

        // ====================== HIER DIE ÄNDERUNG EINFÜGEN (11 Zeilen) ======================
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom') || rawContent.trim().startsWith('<?xml')) {
            console.log(`[Intelligent-Selector-AI] URL ${url} als Feed (XML/RSS) erkannt. KI-Analyse wird übersprungen.`);
            return {
                format: 'rss',
                rules: {
                    message: 'RSS/Atom-Feed erfolgreich erkannt. Es sind keine CSS-Selektoren erforderlich.'
                }
            };
        }
        // =================================== ENDE DER ÄNDERUNG ===================================

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
        Du bist ein Experte für Web-Strukturanalysen und Datenextraktion. Deine Aufgabe ist es, den HTML-Code einer Webseite zu analysieren und präzise, robuste CSS-Selektoren für eine Artikelliste zu generieren.

        ANWEISUNGEN - Führe die folgenden Schritte exakt aus:
        1.  **FINDE DEN CONTAINER:** Identifiziere zuerst den wichtigsten, sich wiederholenden CSS-Selektor, der jeden einzelnen Artikel oder Eintrag in einer Liste umschließt. Dieser 'content_container_selector' muss stabil und prägnant sein (z.B. 'article.news-item', nicht 'div > div > div').
        2.  **ANALYSIERE INNERHALB DES CONTAINERS:** Konzentriere dich nun auf den Inhalt EINES DIESER CONTAINER. Finde die folgenden Elemente und gib ihre Selektoren relativ zum Container an.
            * \`title_selector\`: Der Selektor für die Hauptüberschrift.
            * \`link_selector\`: Der Selektor für den '<a>'-Tag, der zur Detailseite führt.
            * \`date_selector\`: Der Selektor für das Veröffentlichungsdatum.
            * \`description_selector\`: Der Selektor für den kurzen Anreißertext oder die Zusammenfassung.
        3.  **ANALYSIERE DAS DATUMSFORMAT:** Nimm den Textinhalt des gefundenen Datums, analysiere sein Format und gib den passenden 'date-fns' Format-String zurück (z.B. 'dd.MM.yyyy' oder 'd. MMMM yyyy').
        4.  **ANTWORTFORMAT:** Gib deine Antwort AUSSCHLIESSLICH als ein einziges, valides JSON-Objekt zurück. Integriere alle gefundenen Informationen.

        Beispiel für eine perfekte Antwort:
        \`\`\`json
        {
          "format": "html",
          "rules": {
            "content_container_selector": ".post-listing-item",
            "title_selector": "h2.post-title a",
            "link_selector": "h2.post-title a",
            "date_selector": "span.post-date",
            "description_selector": "p.post-excerpt",
            "date_format": "d. MMMM yyyy"
          }
        }
        \`\`\`
        
        Wenn du das Seitenformat absolut nicht bestimmen kannst, antworte mit:
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
    extractTextFromUrl,
};
