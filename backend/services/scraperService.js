// backend/services/scraperService.js
const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { parse } = require('date-fns');
const { de } = require('date-fns/locale');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const db = require('../config/db');
const { logActivity } = require('./auditLogService');
const { callOpenAI } = require('./aiService');
const { scrapeQueue, fundingQueue } = require('./queueService');
const { searchGoogle } = require('./googleSearchService');

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
    return cheerio.load(htmlString).text().trim();
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


const computeRelevanceScore = (publishedAt, tagCount) => {
    let score = 0;
    /*
    const now = new Date();
    if (publishedAt) {
        const days = Math.floor((now - new Date(publishedAt)) / 86400000);
        if (days <= 7) score += 30;
        else if (days <= 30) score += 20;
        else if (days <= 90) score += 10;
    }
    score += (tagCount || 0) * 10;
    if (score > 100) score = 100;
    if (score < 0) score = 0;
    */
    return score;
};


async function _processYoutubeChannel(rule, jobId, availableTags) {
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
            params: { key: YOUTUBE_API_KEY, channelId: channelId, part: 'snippet', order: 'date', maxResults: 20, type: 'video' }
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
            const publishedAt = new Date(snippet.publishedAt);

            // ERWEITERT: Tag-Extraktion und Relevanz-Score-Berechnung
            const textForTags = `${snippet.title} ${snippet.description}`;
            const foundTagIds = extractTags(textForTags, availableTags);
            const relevanceScore = computeRelevanceScore(publishedAt, foundTagIds.length);

            // ERWEITERT: INSERT-Statement enthält jetzt relevance_score
            const contentResult = await db.query(
                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, category, region, thumbnail_url, full_text, relevance_score)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (original_url) DO NOTHING RETURNING id;`,
                [
                    rule.source_identifier, videoUrl, snippet.title, snippet.description, publishedAt,
                    rule.category_default, rule.region, snippet.thumbnails.high.url, channelTitle, relevanceScore
                ]
            );
            if (contentResult.rowCount > 0) {
                itemsInserted++;
                // ERWEITERT: Speichern der gefundenen Tags
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



async function _processXmlFeedByRule(xmlContent, rule, jobId, availableTags, allCategories) {
    const { source_identifier: sourceIdentifier, region: ruleRegion, id: ruleId, date_format: dateFormat, category_default } = rule;
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(xmlContent);

    const feedTitle = result.rss?.channel?.title || null;

    const items = result.rss?.channel?.item || result.feed?.entry || [];
    const feedItems = Array.isArray(items) ? items : [items];
    let itemsInserted = 0;
    await logToDb(jobId, 'INFO', `Verarbeite ${feedItems.length} Einträge für Regel '${sourceIdentifier}'. Feed-Titel: ${feedTitle}`);

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
            let originalUrl, summary, fullText;
            const audioUrl = (item.enclosure?.$?.url && item.enclosure.$.type?.startsWith('audio')) ? item.enclosure.$.url : null;

            if (audioUrl) {
                originalUrl = audioUrl;
                summary = sanitizeHtml(item.description?._ || item.description || null);
                fullText = feedTitle;
            } else {
                originalUrl = item.link?.href || item.link || null;
                const descriptionHtml = item['content:encoded'] || item.description?._ || item.summary?._ || item.description || item.summary || null;
                summary = sanitizeHtml(descriptionHtml);
                fullText = null;
            }

            if (!originalUrl) {
                await logToDb(jobId, 'WARN', `Überspringe Eintrag "${title}", da keine URL gefunden wurde.`);
                continue;
            }

            let thumbnailUrl = null;
            try {
                if (item['media:content']?.$?.url && item['media:content']?.$?.medium === 'image') {
                    thumbnailUrl = item['media:content'].$.url;
                } else if (item.enclosure?.$?.url && item.enclosure.$.type?.startsWith('image')) {
                    thumbnailUrl = item.enclosure.$.url;
                } else if (item['g:image_link']) {
                    thumbnailUrl = item['g:image_link'];
                } else if (item['itunes:image']?.$?.href) {
                    thumbnailUrl = item['itunes:image'].$.href;
                }
            } catch (e) {
                await logToDb(jobId, 'WARN', `Fehler bei der Thumbnail-Extraktion für "${title}": ${e.message}`);
            }

            const cleanTitle = sanitizeHtml(title);
            
            const category = allCategories.find(c => c.name === rule.category_default);
            const categoryId = category ? category.id : null;

            const foundTagIds = extractTags(`${cleanTitle} ${summary}`, availableTags);
            const relevanceScore = computeRelevanceScore(parsedDate, foundTagIds.length);

            const contentResult = await db.query(
                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, event_date, category, category_id, region, thumbnail_url, full_text, relevance_score)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (original_url) DO NOTHING RETURNING id;`,
                [
                    sourceIdentifier, originalUrl, cleanTitle, summary,
                    category_default === 'event' ? null : parsedDate,
                    category_default === 'event' ? parsedDate : null,
                    category_default, categoryId, ruleRegion, thumbnailUrl, fullText, relevanceScore
                ]
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
        await logToDb(jobId, 'INFO', `Starte Headless-Browser (Stealth-Modus) für ${url}`);
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Nutzt Chromium im Docker-Container
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage' // Verhindert RAM-Abstürze bei großen Webseiten im Container
            ]
        });
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }); // networkidle0 ist hier besser

        // Die intelligente Cookie-Logik bleibt, falls sie für andere Seiten benötigt wird
        try {
            await logToDb(jobId, 'INFO', 'Suche nach generischem Cookie-Banner zum Akzeptieren...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const keywords = ['alle akzeptieren', 'akzeptieren', 'zustimmen', 'einverstanden', 'got it', 'accept all', 'allow all', 'ich stimme zu'];
            const elements = await page.$$('button, a');
            let clicked = false;
            for (const el of elements) {
                const textContent = await el.evaluate(node => node.textContent);
                if (textContent) {
                    const text = textContent.trim().toLowerCase();
                    if (keywords.includes(text)) {
                        await logToDb(jobId, 'INFO', `Potenzieller Cookie-Button gefunden mit Text: "${text}". Versuche Klick.`);
                        try {
                            await el.click();
                            clicked = true;
                            await logToDb(jobId, 'INFO', 'Cookie-Banner wurde erfolgreich geklickt.');
                            break;
                        } catch (clickError) {
                            await logToDb(jobId, 'WARN', `Klick auf Element mit Text "${text}" fehlgeschlagen.`);
                        }
                    }
                }
            }
            if (clicked) await new Promise(resolve => setTimeout(resolve, 2000));
            else await logToDb(jobId, 'INFO', 'Kein generischer Cookie-Banner-Button gefunden.');
        } catch (e) {
            await logToDb(jobId, 'WARN', `Fehler bei der Suche nach Cookie-Banner: ${e.message}`);
        }

        if (waitForSelector) {
            await logToDb(jobId, 'INFO', `Warte auf iFrame und dann auf Selektor: ${waitForSelector}`);

            // --- HIER IST DIE IFRAME-LOGIK ---
            // 1. Warte auf das iFrame-Element selbst
            // Der Selektor 'iframe' ist ausreichend, da es der einzige relevante auf der Seite ist.
            const iframeElement = await page.waitForSelector('iframe', { timeout: 10000 });
            if (!iframeElement) throw new Error('Das iFrame-Element wurde auf der Seite nicht gefunden.');

            // 2. Hole den Inhalts-Frame des iFrames
            const frame = await iframeElement.contentFrame();
            if (!frame) throw new Error('Konnte den Inhalt des iFrames nicht laden.');
            
            // 3. Warte auf den Selektor INNERHALB des iFrames
            await frame.waitForSelector(waitForSelector, { timeout: 15000 });
        }
        
        // Gib den Inhalt der gesamten Seite zurück (inklusive des gerenderten iFrames)
        const content = await page.content();
        await logToDb(jobId, 'INFO', `Inhalt erfolgreich mit Headless-Browser geladen.`);
        return content;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}


// in scraperService.js

async function _scrapeWAWPrograms(rule, jobId) {
    await logToDb(jobId, 'INFO', 'Starte WAW-Programmscrape (Übersichtsseite).');
    const PROGRAMS_URL = 'https://wirtschaftsagentur.at/aktuelle-foerderungen-der-wirtschaftsagentur-wien/';
    let enqueued = 0;

    // 1. Primärversuch: JSON aus Script-Tag (#waw-programs-data) auslesen
    try {
        const res = await axios.get(PROGRAMS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 20000
        });
        const $ = cheerio.load(res.data);
        const dataScript = $('script#waw-programs-data').html();
        if (dataScript) {
            await logToDb(jobId, 'INFO', 'Erfolgreich #waw-programs-data gefunden, parse JSON.');
            const programs = JSON.parse(dataScript);
            if (Array.isArray(programs)) {
                for (const p of programs) {
                    if (!p?.url) continue;
                    const url = new URL(p.url, PROGRAMS_URL).href;
                    await fundingQueue.add('extract-funding-details', {
                        sourceRuleId: rule.id, articleUrl: url, region: rule.region
                    });
                    enqueued++;
                }
                await logToDb(jobId, 'INFO', `WAW JSON: ${enqueued} Förderungen in die Queue gelegt.`);
                return enqueued; // Erfolgreich, Funktion hier beenden
            }
        }
        await logToDb(jobId, 'INFO', 'Kein #waw-programs-data JSON gefunden. Fallback auf Headless Browser wird gestartet.');
    } catch (e) {
        await logToDb(jobId, 'WARN', `JSON-Script-Versuch fehlgeschlagen: ${e.message}. Nutze Fallback.`);
    }

    // --- KORRIGIERTER FALLBACK-BLOCK ---
    // 2. Fallback: DOM mit Puppeteer scrapen und Links gezielt aus den Förderkarten extrahieren
    await logToDb(jobId, 'INFO', 'Fallback: Starte Puppeteer, um die gerenderte Seite zu analysieren.');
    // Warten auf die Karten, um sicherzustellen, dass sie geladen sind
    const html = await _fetchContentWithPuppeteer(PROGRAMS_URL, '.card.card-program', jobId);
    const $ = cheerio.load(html);

    const links = new Set();
    
    // Finde zuerst alle Förder-Karten-Container
    $('.card.card-program').each((_, container) => {
        // Suche DANN den Link innerhalb des Containers. Da die ganze Karte ein Link ist, ist es einfach.
        const linkElement = $(container).find('a');
        const href = linkElement.attr('href');
        
        if (href && !href.startsWith('#')) {
            links.add(new URL(href, PROGRAMS_URL).href);
        }
    });

    for (const url of links) {
        await fundingQueue.add('extract-funding-details', {
            sourceRuleId: rule.id, articleUrl: url, region: rule.region
        });
        enqueued++;
    }
    await logToDb(jobId, 'INFO', `DOM-Fallback: ${enqueued} Förderungen in die Queue gelegt.`);
    return enqueued;
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

        // KORREKTUR: Lädt alle Kategorien zu Beginn des Jobs
        const categoriesResult = await db.query('SELECT id, name FROM categories');
        const allCategories = categoriesResult.rows;

        switch (rule.scraping_strategy) {
            case 'youtube_channel':
                itemsProcessed = await _processYoutubeChannel(rule, jobId, availableTags, allCategories);
                break;
            case 'youtube_podcast':
                itemsProcessed = await _processYoutubePodcastsTab(rule, jobId, availableTags, allCategories);
                break;
            case 'youtube_music':
                itemsProcessed = await _processYoutubeMusicPlaylist(rule, jobId, availableTags, allCategories);
                break;
            case 'html_embedded_json':
                itemsProcessed = await _scrapeWAWPrograms(rule, jobId);
                break;
            case 'standard':
            default:
                let rawContent;
                let contentType;
                if (rule.use_headless_browser) {
                    rawContent = await _fetchContentWithPuppeteer(rule.url_pattern, rule.content_container_selector, jobId);
                    contentType = 'text/html';
                } else {
                    const response = await axios.get(rule.url_pattern, { timeout: 15000 });
                    rawContent = response.data;
                    contentType = response.headers['content-type'] || '';
                }

                if (rule.rule_type === 'funding') {
                    if (contentType.includes('html')) {
                        const $ = cheerio.load(rawContent);
                        const articleContainers = $(rule.content_container_selector);
                        await logToDb(jobId, 'INFO', `${articleContainers.length} potenzielle Förderungs-Einträge gefunden.`);
                        for (const container of articleContainers) {
                            const linkElement = $(container).find(rule.link_selector);
                            const relativeUrl = linkElement.attr('href');
                            if (!relativeUrl) continue;
                            const absoluteUrl = new URL(relativeUrl, rule.url_pattern).href;
                            await fundingQueue.add('extract-funding-details', { sourceRuleId: rule.id, articleUrl: absoluteUrl, region: rule.region });
                            itemsProcessed++;
                        }
                    } else {
                         itemsProcessed = await _processFundingXmlFeed(rawContent, rule, jobId);
                    }
                } else { // rule_type 'content'
                    if (contentType.includes('html')) {
                        const $ = cheerio.load(rawContent);
                        const articleContainers = $(rule.content_container_selector);
                        await logToDb(jobId, 'INFO', `${articleContainers.length} potenzielle Content-Einträge gefunden.`);
                        for (const container of articleContainers) {
                            const element = $(container);
                            const title = sanitizeHtml(element.find(rule.title_selector).text());
                            const linkHref = element.find(rule.link_selector).attr('href');
                            if (!title || !linkHref) continue;

                            const link = new URL(linkHref, rule.url_pattern).href;
                            const summary = sanitizeHtml(element.find(rule.description_selector).text());
                            const dateString = element.find(rule.date_selector).text();
                            const publishedDate = parseDateString(dateString, rule.date_format, jobId);
                            const thumbnailSrc = element.find(rule.thumbnail_selector).attr('src');
                            const thumbnailUrl = thumbnailSrc ? new URL(thumbnailSrc, rule.url_pattern).href : null;
                            
                            const category = allCategories.find(c => c.name === rule.category_default);
                            const categoryId = category ? category.id : null;

                            const fullText = `${title} ${summary}`;
                            const foundTagIds = extractTags(fullText, availableTags);
                            const relevanceScore = computeRelevanceScore(publishedDate, foundTagIds.length);

                            const res = await db.query(
                                `INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, category, category_id, region, thumbnail_url, relevance_score)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                 ON CONFLICT (original_url) DO NOTHING RETURNING id`,
                                [rule.source_identifier, link, title, summary, publishedDate, rule.category_default, categoryId, rule.region, thumbnailUrl, relevanceScore]
                            );
                            if (res.rowCount > 0) {
                                itemsProcessed++;
                                const contentId = res.rows[0].id;
                                for (const tagId of foundTagIds) {
                                    await db.query('INSERT INTO scraped_content_tags (scraped_content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [contentId, tagId]);
                                }
                            }
                        }
                    } else if (contentType.includes('xml') || contentType.includes('rss')) {
                        itemsProcessed = await _processXmlFeedByRule(rawContent, rule, jobId, availableTags, allCategories);
                    } else {
                        throw new Error(`Nicht unterstützter Inhaltstyp für Regel-Typ 'content': ${contentType}.`);
                    }
                }
                break;
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
    let model = 'gpt-3.5-turbo';

    // 1. Daten abrufen (Fehlerhaftes try-catch repariert)
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

    // OPTIMIERT: System-Prompt klarer für JSON formuliert und XML-Tags für den Content genutzt
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
        4.  ANTWORTFORMAT: Gib deine Antwort AUSSCHLIESSLICH als ein einziges, valides JSON-Objekt zurück.

        GEFORDERTE JSON-STRUKTUR:
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
        
        Wenn du das Seitenformat absolut nicht bestimmen kannst, antworte exakt mit diesem JSON:
        { "format": "unknown", "rules": { "message": "Das Format der Seite konnte nicht automatisch erkannt werden." } }

        HIER IST DER ZU ANALYSIERENDE HTML-INHALT:
        <html_content>
        ${rawContent.substring(0, 40000)}
        </html_content>
    `;

    let aiResponseContent = '';
    
    // 2. KI-Aufruf mit nativem JSON-Mode
    try {
        // OPTIMIERT: Wir übergeben { responseFormat: { type: "json_object" } } an unseren aiService
        const { content, usage } = await callOpenAI(prompt, model, { responseFormat: { type: "json_object" } });
        aiResponseContent = content;
        
        if (!aiResponseContent || aiResponseContent.trim() === '') {
            throw new Error('Die KI hat eine leere Antwort zurückgegeben.');
        }

        // OPTIMIERT: Da wir den json_object Modus nutzen, brauchen wir keine Regex-Magie mehr. 
        // Wir machen nur einen Fallback-Trim, falls unerwartet Whitespace da ist.
        let jsonString = aiResponseContent;
        const firstBrace = aiResponseContent.indexOf('{');
        const lastBrace = aiResponseContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
             jsonString = aiResponseContent.substring(firstBrace, lastBrace + 1);
        }

        const suggestion = JSON.parse(jsonString);

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


async function _processYoutubeMusicPlaylist(rule, jobId, availableTags) {
    await logToDb(jobId, 'INFO', `Starte YouTube Music Playlist-Verarbeitung für: ${rule.url_pattern}`);

    const playlistIdMatch = rule.url_pattern.match(/list=([a-zA-Z0-9_-]+)/);
    if (!playlistIdMatch || !playlistIdMatch[1]) {
        await logToDb(jobId, 'ERROR', `Konnte keine gültige Playlist-ID in der URL finden: ${rule.url_pattern}`);
        throw new Error('Invalid YouTube Music Playlist URL format.');
    }
    const playlistId = playlistIdMatch[1];
    await logToDb(jobId, 'INFO', `Playlist-ID gefunden: ${playlistId}`);

    // Rufe alle Video-IDs aus der Playlist ab
    const allVideoIds = new Set();
    try {
        const items = await _ytListPlaylistItems(jobId, playlistId);
        for (const it of items) {
            const vid = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
            if (vid) allVideoIds.add(vid);
        }
    } catch (error) {
        await logToDb(jobId, 'ERROR', `Konnte Playlist-Inhalt für ID ${playlistId} nicht abrufen: ${error.message}`);
        throw new Error(`Failed to retrieve playlist items: ${error.message}`);
    }

    const videoIds = [...allVideoIds];
    if (!videoIds.length) {
        await logToDb(jobId, 'INFO', `Keine Videos in der Playlist gefunden.`);
        return 0;
    }

    // Hole die Details für alle Videos und speichere sie
    const videosMap = await _ytVideosListBulk(jobId, videoIds);
    let inserted = 0;
    for (const id of videoIds) {
        const v = videosMap.get(id);
        if (!v) continue;

        const sn = v.snippet || {};
        const videoUrl = `https://www.youtube.com/watch?v=${id}`;
        const publishedAt = sn.publishedAt ? new Date(sn.publishedAt) : null;
        const title = sn.title || 'Ohne Titel';
        const description = sn.description || null;
        const thumbnail = sn.thumbnails?.high?.url || sn.thumbnails?.standard?.url || sn.thumbnails?.medium?.url || null;
        const category = rule.category_default || 'music';

        const cleanTitle = sanitizeHtml(title);
        const cleanDescription = sanitizeHtml(description);
        const foundTagIds = extractTags(`${cleanTitle} ${cleanDescription}`, availableTags);
        const relevanceScore = computeRelevanceScore(publishedAt, foundTagIds.length);

        try {
            const res = await db.query(
                `INSERT INTO scraped_content
                 (source_identifier, original_url, title, summary, published_date, category, region, thumbnail_url, full_text, relevance_score)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (original_url) DO NOTHING
                 RETURNING id;`,
                [
                    rule.source_identifier, videoUrl, cleanTitle, cleanDescription, publishedAt, category,
                    rule.region || null, thumbnail, sn.channelTitle || null, relevanceScore
                ]
            );

            if (res.rowCount > 0) {
                inserted++;
                const scrapedContentId = res.rows[0].id;
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
        } catch (e) {
            await logToDb(jobId, 'WARN', `Insert übersprungen für ${videoUrl}: ${e.message}`);
        }
    }

    await logToDb(jobId, 'INFO', `Musik-Titel gespeichert: ${inserted}/${videoIds.length}`);
    return inserted;
}


// NEU: Hauptprozessor für YouTube-Podcasts
async function _processYoutubePodcastsTab(rule, jobId, availableTags) {
    await logToDb(jobId, 'INFO', `Starte YouTube Podcasts-API-Verarbeitung für: ${rule.url_pattern}`);
    const channelId = await _ytResolveChannelId(jobId, rule.url_pattern);
    
    let playlistIds = await _ytGetPodcastPlaylistIdsFromSections(jobId, channelId);
    if (!playlistIds.length) {
        await logToDb(jobId, 'WARN', `Keine explizite "Podcasts"-Section gefunden. Fallback auf Playlist-Heuristik.`);
        playlistIds = await _ytGetPodcastPlaylistIdsHeuristic(jobId, channelId);
    }

    if (!playlistIds.length) {
        await logToDb(jobId, 'INFO', `Keine Podcast-Playlists gefunden – nichts zu speichern.`);
        return 0;
    }

    await logToDb(jobId, 'INFO', `Podcast-Playlists gefunden: ${playlistIds.join(', ')}`);
    
const allVideoIds = new Set();
    for (const plId of playlistIds) {
        try {
            const items = await _ytListPlaylistItems(jobId, plId);
            for (const it of items) {
                const vid = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
                if (vid) allVideoIds.add(vid);
            }
        } catch (error) {
            await logToDb(jobId, 'WARN', `Konnte Playlist-Inhalt für ID ${plId} nicht abrufen (möglicherweise nicht öffentlich). Überspringe...`);
        }
    }

    const videoIds = [...allVideoIds];
    if (!videoIds.length) {
        await logToDb(jobId, 'INFO', `Keine Videos in den Podcast-Playlists gefunden.`);
        return 0;
    }

    const videosMap = await _ytVideosListBulk(jobId, videoIds);
    let inserted = 0;
    for (const id of videoIds) {
        const v = videosMap.get(id);
        if (!v) continue;

        const sn = v.snippet || {};
        const videoUrl = `https://www.youtube.com/watch?v=${id}`;
        const publishedAt = sn.publishedAt ? new Date(sn.publishedAt) : null;
        const title = sn.title || 'Ohne Titel';
        const description = sn.description || null;
        const thumbnail = sn.thumbnails?.high?.url || sn.thumbnails?.standard?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || null;
        const category = rule.category_default || 'podcast';

        const cleanTitle = sanitizeHtml(title);
        const cleanDescription = sanitizeHtml(description);
        const foundTagIds = extractTags(`${cleanTitle} ${cleanDescription}`, availableTags);
        const relevanceScore = computeRelevanceScore(publishedAt, foundTagIds.length);

        try {
            const res = await db.query(
                `INSERT INTO scraped_content
                 (source_identifier, original_url, title, summary, published_date, category, region, thumbnail_url, full_text, relevance_score)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (original_url) DO NOTHING
                 RETURNING id;`,
                [
                    rule.source_identifier,
                    videoUrl,
                    cleanTitle,
                    cleanDescription,
                    publishedAt,
                    category,
                    rule.region || null,
                    thumbnail,
                    sn.channelTitle || null,
                    relevanceScore
                ]
            );

            if (res.rowCount > 0) {
                inserted++;
                const scrapedContentId = res.rows[0].id;
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
        } catch (e) {
            await logToDb(jobId, 'WARN', `Insert übersprungen für ${videoUrl}: ${e.message}`);
        }
    }

    await logToDb(jobId, 'INFO', `Podcast-Videos gespeichert: ${inserted}/${videoIds.length}`);
    return inserted;
}


// NEU: YouTube Podcasts API-Helpers
async function _ytApiGet(jobId, endpoint, params) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
        await logToDb(jobId, 'ERROR', 'YouTube API Key ist nicht in der .env-Datei konfiguriert.');
        throw new Error('YouTube API Key not configured.');
    }
    const url = `https://www.googleapis.com/youtube/v3/${endpoint}`;
    const res = await axios.get(url, { params: { key: YOUTUBE_API_KEY, ...params } });
    return res.data;
}

// NEU: YouTube Podcasts – Handle/ChannelId Resolver
function _extractHandleOrChannelId(input) {
    if (!input) return null;
    const chMatch = input.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
    if (chMatch) return { type: 'channelId', value: chMatch[1] };
    const handleMatch = input.match(/@([A-Za-z0-9_.-]+)/);
    if (handleMatch) return { type: 'handle', value: handleMatch[1] };
    return null;
}

// NEU
async function _ytResolveChannelId(jobId, handleOrUrl) {
    const parsed = _extractHandleOrChannelId(handleOrUrl);
    if (!parsed) throw new Error('Konnte Handle/Kanal aus der URL nicht erkennen.');
    if (parsed.type === 'channelId') return parsed.value;
    
    // Suche nach dem Kanal über den Handle, um die ID zu bekommen
    const data = await _ytApiGet(jobId, 'search', {
        part: 'snippet',
        type: 'channel',
        q: parsed.value,
        maxResults: 1,
    });
    const item = (data.items || [])[0];
    const channelId = item?.snippet?.channelId || item?.id?.channelId;
    if (!channelId) throw new Error(`Channel mit Handle '${parsed.value}' nicht gefunden.`);
    return channelId;
}

// NEU
async function _ytGetPodcastPlaylistIdsFromSections(jobId, channelId) {
    const data = await _ytApiGet(jobId, 'channelSections', {
        part: 'snippet,contentDetails',
        channelId,
    });
    const out = new Set();
    for (const s of data.items || []) {
        const title = (s.snippet?.title || '').toLowerCase();
        const isPlaylistShelf = ['singlePlaylist', 'multiplePlaylists'].includes(s.snippet?.type);
        // Prüfen, ob eine Section explizit "Podcasts" heißt
        const looksLikePodcast = /podcast/.test(title);
        if (isPlaylistShelf && looksLikePodcast) {
            (s.contentDetails?.playlists || []).forEach(id => out.add(id));
        }
    }
    return [...out];
}

// NEU: Fallback-Methode, falls die "Sections"-API keine Ergebnisse liefert
async function _ytGetPodcastPlaylistIdsHeuristic(jobId, channelId) {
    let pageToken;
    const matches = [];
    do {
        const data = await _ytApiGet(jobId, 'playlists', {
            part: 'snippet,contentDetails',
            channelId,
            maxResults: 50,
            pageToken,
        });
        for (const p of data.items || []) {
            // Suche in Titel und Beschreibung nach typischen Podcast-Keywords
            const text = `${p.snippet?.title || ''} ${p.snippet?.description || ''}`.toLowerCase();
            if (/(^|\s)podcast(s)?(\s|$)|folge|episode/.test(text)) {
                matches.push(p.id);
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return matches;
}

// NEU
async function _ytListPlaylistItems(jobId, playlistId) {
    let pageToken, items = [];
    do {
        const data = await _ytApiGet(jobId, 'playlistItems', {
            part: 'snippet,contentDetails',
            playlistId,
            maxResults: 50,
            pageToken,
        });
        items.push(...(data.items || []));
        pageToken = data.nextPageToken;
    } while (pageToken);
    return items;
}

// NEU: Effizientes Abrufen von vielen Video-Details auf einmal
async function _ytVideosListBulk(jobId, videoIds) {
    const batches = [];
    for (let i = 0; i < videoIds.length; i += 50) {
        batches.push(videoIds.slice(i, i + 50));
    }
    const out = [];
    for (const b of batches) {
        const data = await _ytApiGet(jobId, 'videos', {
            part: 'snippet,contentDetails',
            id: b.join(','),
            maxResults: 50,
        });
        out.push(...(data.items || []));
    }
    const map = new Map();
    for (const v of out) map.set(v.id, v);
    return map;
}


async function processNewsKeywordSearch(jobData) {
    const { search_term, account_id, competitor_name } = jobData;

    if (!search_term || !account_id) {
        console.error('[NewsSearch] Job übersprungen: search_term oder account_id fehlen.');
        return 0;
    }

    console.log(`[NewsSearch] Starte Google-Suche für "${search_term}" im Kontext von Account ${account_id}`);
    const searchResults = await searchGoogle(`"${search_term}"`, { sortByDate: true, language: 'lr=lang_de' });

    if (!searchResults || searchResults.length === 0) {
        console.log(`[NewsSearch] Keine neuen Google-Ergebnisse für "${search_term}" gefunden.`);
        return 0;
    }

    let itemsInserted = 0;
    for (const result of searchResults) {
        try {
            const articleText = await extractTextFromUrl(result.link);

            // NEUE ÜBERPRÜFUNG: Nur fortfahren, wenn der Text existiert UND der Suchbegriff enthalten ist.
            if (articleText && articleText.toLowerCase().includes(search_term.toLowerCase())) {
                
                let articleSummary = await getSummaryForArticle(articleText, result.link);

                const insertResult = await db.query(
                    `INSERT INTO business_partner_tracked_articles 
                        (account_id, competitor_name, article_title, article_url, source_name, published_at, summary)
                     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
                     ON CONFLICT (account_id, article_url) DO NOTHING`,
                    [
                        account_id,
                        competitor_name || null,
                        result.title,
                        result.link,
                        new URL(result.link).hostname,
                        articleSummary
                    ]
                );

                if (insertResult.rowCount > 0) {
                    itemsInserted++;
                }

            } else {
                console.log(`[Relevance Check] Artikel übersprungen: "${result.link}" enthält den Begriff "${search_term}" nicht.`);
            }
        } catch (dbError) {
            console.error(`[NewsSearch] Fehler beim Verarbeiten des Artikels "${result.link}":`, dbError.message);
        }
    }

    console.log(`[NewsSearch] ${itemsInserted} neue und verifizierte Artikel für "${search_term}" gespeichert.`);
    return itemsInserted;
}


async function getSummaryForArticle(articleText, articleUrl) {
    if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY nicht gesetzt. Simuliere Artikel-Zusammenfassung.');
        return "Simulierte Stichpunkte: Wichtige Entwicklung, Neue Regelung, Auswirkungen auf die Branche.";
    }
    if (!articleText || articleText.length < 100) return '';

    const prompt = `Fasse den folgenden Artikeltext in 3-5 prägnanten Stichpunkten auf Deutsch zusammen. Gib nur die Stichpunkte aus, ohne Einleitung oder Fazit. TEXT: """${articleText}"""`;

    await logActivity({ actionType: 'AI_SUMMARIZATION_START', status: 'info', details: { url: articleUrl, model: 'gpt-3.5-turbo' }, username: 'System' });

    try {
        const { content: summary, usage, model } = await callOpenAI(prompt, 'gpt-3.5-turbo');
        await logActivity({
            actionType: 'AI_SUMMARIZATION_SUCCESS', status: 'success',
            details: { url: articleUrl, model, tokenUsage: usage, summaryLength: summary.length },
            username: 'System'
        });
        return summary;
    } catch (error) {
        console.error(`Fehler bei der Artikel-Zusammenfassung für ${articleUrl}:`, error.message);
        await logActivity({ actionType: 'AI_SUMMARIZATION_FAILURE', status: 'failure', details: { url: articleUrl, model: 'gpt-3.5-turbo', error: error.message }, username: 'System' });
        return '';
    }
}


module.exports = {
    triggerSingleRuleScrape,
    startAllScrapingJobs,
    getScrapingRuleSuggestion,
    extractTextFromUrl,
    processNewsKeywordSearch,
};