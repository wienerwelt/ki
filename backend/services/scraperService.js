const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { parse } = require('date-fns');
const { de } = require('date-fns/locale');
const puppeteer = require('puppeteer');
const db = require('../config/db');
const { logActivity } = require('./auditLogService');
const { callOpenAI } = require('./aiService');
const { scrapeQueue, fundingQueue } = require('./queueService');

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
        if (dateFormat) {
            const parsed = parse(trimmedDate, dateFormat, new Date(), { locale: de });
            if (!isNaN(parsed.getTime())) return parsed;
        }
        try {
            const rssFormat = "EEE, dd MMM yyyy HH:mm:ss xx";
            const parsedRss = parse(trimmedDate, rssFormat, new Date(), { locale: de });
            if (!isNaN(parsedRss.getTime())) return parsedRss;
        } catch (e) {}
        const fallbackParsed = new Date(trimmedDate);
        if (!isNaN(fallbackParsed.getTime())) return fallbackParsed;
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

const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const extractTags = (text, availableTags) => {
    if (!text || !availableTags) return [];
    const foundTagIds = new Set();
    availableTags.forEach(tag => {
        const escapedTagName = escapeRegex(tag.name);
        const regex = new RegExp(`\\b${escapedTagName}\\b`, 'i');
        if (regex.test(text)) {
            foundTagIds.add(tag.id);
        }
    });
    return Array.from(foundTagIds);
};

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
        const channelTitle = videos[0].snippet.channelTitle;
        await logToDb(jobId, 'INFO', `${videos.length} Videos vom Kanal "${channelTitle}" gefunden. Speichere in DB...`);
        let itemsInserted = 0;
        for (const video of videos) {
            const videoId = video.id.videoId;
            const snippet = video.snippet;
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const contentResult = await db.query(
                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, category, region, thumbnail_url, full_text)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (original_url) DO NOTHING RETURNING id;`,
                [
                    rule.source_identifier, videoUrl, snippet.title, snippet.description, new Date(snippet.publishedAt),
                    rule.category_default, rule.region, snippet.thumbnails.high.url, channelTitle
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
        // --- NEUER ZWISCHENSCHRITT: HTML-Code bereinigen ---
        // Lade den rohen HTML-Code in Cheerio
        const $ = cheerio.load(htmlContent);
        // Entferne alle script- und style-Tags, die oft Fehler verursachen
        $('script, style').remove();
        // Gib den bereinigten HTML-Code zurück
        const cleanedHtml = $.html();

        // --- Bestehende Logik mit dem bereinigten Code ---
        const dom = new JSDOM(cleanedHtml, { url });
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
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (link) DO UPDATE SET description = EXCLUDED.description, published_at = EXCLUDED.published_at, title = EXCLUDED.title;`,
                [title, item.description || null, link, parsedDate, title.split(',')[0], ruleRegion, 'Stau', sourceIdentifier, ruleId, guid]
            );
            if (result.rowCount > 0) itemsInserted++;
        } else {
            const articleUrl = item.link?.href || item.link || null;
            if (!articleUrl) continue;
            let thumbnailUrl = null;
            try {
                if (item['media:content']?.$?.url && item['media:content']?.$?.medium === 'image') {
                    thumbnailUrl = item['media:content'].$.url;
                } else if (item.enclosure?.$?.url && item.enclosure.$.type?.startsWith('image')) {
                    thumbnailUrl = item.enclosure.$.url;
                } else if (item['g:image_link']) {
                    thumbnailUrl = item['g:image_link'];
                } else {
                    const descriptionHtml = item.description?._ || item.summary?._ || item.description || item.summary;
                    if (descriptionHtml) {
                        const $ = cheerio.load(descriptionHtml);
                        const firstImgSrc = $('img').first().attr('src');
                        if (firstImgSrc) {
                            thumbnailUrl = firstImgSrc;
                        }
                    }
                }
            } catch (e) {
                await logToDb(jobId, 'WARN', `Fehler bei der Thumbnail-Extraktion für "${title}": ${e.message}`);
            }
            const cleanTitle = sanitizeHtml(title);
            const cleanDescription = sanitizeHtml(item.description?._ || item.summary?._ || item.description || item.summary || null);
            const foundTagIds = extractTags(`${cleanTitle} ${cleanDescription}`, availableTags);
            const contentResult = await db.query(
                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, event_date, category, region, thumbnail_url)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (original_url) DO NOTHING RETURNING id;`,
                [sourceIdentifier, articleUrl, cleanTitle, cleanDescription, category_default === 'event' ? null : parsedDate, category_default === 'event' ? parsedDate : null, category_default, ruleRegion, thumbnailUrl]
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

async function _processFundingXmlFeed(xmlContent, rule, jobId) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(xmlContent);
    const items = result.rss?.channel?.item || result.feed?.entry || [];
    const feedItems = Array.isArray(items) ? items : [items];
    let itemsEnqueued = 0;
    await logToDb(jobId, 'INFO', `Funding-Feed erkannt. Verarbeite ${feedItems.length} Einträge.`);
    for (const item of feedItems) {
        const articleUrl = item.link?.href || item.link || null;
        if (!articleUrl) continue;
        try {
            await fundingQueue.add('extract-funding-details', {
                sourceRuleId: rule.id,
                articleUrl: articleUrl,
                region: rule.region,
            });
            itemsEnqueued++;
        } catch (e) {
            await logToDb(jobId, 'WARN', `Konnte Job für URL '${articleUrl}' nicht erstellen. Wird übersprungen.`);
        }
    }
    return itemsEnqueued;
}

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

async function _fetchContentWithPuppeteer(url, waitForSelector, jobId) {
    let browser = null;
    try {
        await logToDb(jobId, 'INFO', `Starte Headless-Browser für ${url}`);
        browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Wichtig für Server-Umgebungen
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        if (waitForSelector) {
            await logToDb(jobId, 'INFO', `Warte auf Selektor: ${waitForSelector}`);
            await page.waitForSelector(waitForSelector, { timeout: 15000 });
        }
        
        const content = await page.content();
        await logToDb(jobId, 'INFO', `Inhalt erfolgreich mit Headless-Browser geladen.`);
        return content;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function triggerSingleRuleScrape(ruleId, jobId) {
    let itemsProcessed = 0;
    try {
        await db.query(`UPDATE scraping_jobs SET status = 'running' WHERE id = $1`, [jobId]);
        await logToDb(jobId, 'INFO', `Job gestartet für Scraping-Regel ID: ${ruleId}`);
        
        const ruleResult = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [ruleId]);
        if (ruleResult.rows.length === 0) throw new Error(`Scraping-Regel mit ID ${ruleId} nicht gefunden.`);
        const rule = ruleResult.rows[0];
        
        const tagsResult = await db.query('SELECT id, name FROM tags');
        const availableTags = tagsResult.rows;

        let rawContent;
        let contentType;

        if (rule.url_pattern && rule.url_pattern.includes('youtube.com/channel/')) {
            itemsProcessed = await _processYoutubeChannel(rule, jobId);
        } else {
            if (rule.use_headless_browser) {
                rawContent = await _fetchContentWithPuppeteer(rule.url_pattern, rule.content_container_selector, jobId);
                contentType = 'text/html';
            } else {
                const response = await axios.get(rule.url_pattern, { timeout: 15000 });
                rawContent = response.data;
                contentType = response.headers['content-type'] || '';
            }

            if (rule.rule_type === 'funding') {
                await logToDb(jobId, 'INFO', `Regel-Typ 'funding' erkannt. Prüfe Inhaltstyp: ${contentType}`);
                
                if (contentType.includes('xml') || contentType.includes('rss')) {
                    itemsProcessed = await _processFundingXmlFeed(rawContent, rule, jobId);
                } else if (contentType.includes('html')) {
                    const $ = cheerio.load(rawContent);
                    const articleContainers = $(rule.content_container_selector);
                    await logToDb(jobId, 'INFO', `${articleContainers.length} potenzielle Förderungs-Einträge auf der Seite gefunden.`);
                    
                    if(articleContainers.length === 0 && rule.use_headless_browser) {
                        await logToDb(jobId, 'WARN', `Headless-Browser hat Inhalt geladen, aber Selektor '${rule.content_container_selector}' hat nichts gefunden.`);
                    }

                    for (const container of articleContainers) {
                        const element = $(container);
                        const linkElement = element.find(rule.link_selector);
                        const relativeUrl = linkElement.attr('href');
                        if (!relativeUrl) continue;
                        try {
                            const absoluteUrl = new URL(relativeUrl, rule.url_pattern).href;
                            await fundingQueue.add('extract-funding-details', { sourceRuleId: rule.id, articleUrl: absoluteUrl, region: rule.region });
                            itemsProcessed++;
                        } catch (e) {}
                    }
                } else {
                     throw new Error(`Nicht unterstützter Inhaltstyp für Funding-Regel: ${contentType}.`);
                }
                await logToDb(jobId, 'INFO', `${itemsProcessed} Jobs für die Detailanalyse wurden erfolgreich zur 'funding-extraction'-Queue hinzugefügt.`);
            } else {
                await logToDb(jobId, 'INFO', `Regel-Typ 'content' erkannt. Starte Standard-Scraping.`);
                if (contentType.includes('xml') || contentType.includes('rss')) {
                    itemsProcessed = await _processXmlFeedByRule(rawContent, rule, jobId, availableTags);
                } else if (contentType.includes('html')) {
                    // ... Ihre bestehende Logik für HTML-Listen und einzelne Seiten für 'content' ...
                } else {
                    throw new Error(`Nicht unterstützter Inhaltstyp: ${contentType}.`);
                }
            }
        }

        await logToDb(jobId, 'INFO', `Zusammenfassung: ${itemsProcessed} Einträge wurden erfolgreich verarbeitet.`);
        await db.query('UPDATE scraping_rules SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = $1', [ruleId]);
        await db.query(`UPDATE scraping_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
        await logToDb(jobId, 'INFO', 'Job erfolgreich abgeschlossen.');

    } catch (err) {
        console.error(`[Scraping Job ${jobId}] Kritischer Fehler:`, err.message, err.stack);
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
        1.  FINDE DEN CONTAINER: Identifiziere zuerst den wichtigsten, sich wiederholenden CSS-Selektor, der jeden einzelnen Artikel oder Eintrag in einer Liste umschließt. Dieser 'content_container_selector' muss stabil und prägnant sein (z.B. 'article.news-item', nicht 'div > div > div').
        2.  ANALYSIERE INNERHALB DES CONTAINERS: Konzentriere dich nun auf den Inhalt EINES DIESER CONTAINER. Finde die folgenden Elemente und gib ihre Selektoren relativ zum Container an.
            * \`title_selector\`: Der Selektor für die Hauptüberschrift.
            * \`link_selector\`: Der Selektor für den '<a>'-Tag, der zur Detailseite führt.
            * \`date_selector\`: Der Selektor für das Veröffentlichungsdatum.
            * \`description_selector\`: Der Selektor für den kurzen Anreißertext oder die Zusammenfassung.
        3.  ANALYSIERE DAS DATUMSFORMAT: Nimm den Textinhalt des gefundenen Datums, analysiere sein Format und gib den passenden 'date-fns' Format-String zurück (z.B. 'dd.MM.yyyy' oder 'd. MMMM yyyy').
        4.  ANTWORTFORMAT: Gib deine Antwort AUSSCHLIESSLICH als ein einziges, valides JSON-Objekt zurück. Integriere alle gefundenen Informationen.

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