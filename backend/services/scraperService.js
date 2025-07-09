// backend/services/scraperService.js
const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const db = require('../config/db');
const { parse } = require('date-fns');
const { logActivity } = require('./auditLogService');

// Helfer-Funktion zum Schreiben von Logs in die DB
const logToDb = async (jobId, level, message) => {
    try {
        await db.query(
            `INSERT INTO scraping_logs (job_id, log_level, message) VALUES ($1, $2, $3)`,
            [jobId, level, message]
        );
    } catch (dbError) {
        console.error(`FATAL: Could not write log to DB for jobId ${jobId}:`, dbError);
    }
};

// Eine robustere Funktion zum Verarbeiten von Datums-Strings
const parseDateString = (dateString, dateFormat, jobId) => {
    if (!dateString) return null;

    let parsedDate;
    try {
        if (dateFormat) {
            // Versuch mit dem vorgegebenen Format
            parsedDate = parse(dateString, dateFormat, new Date());
        } else {
            // Standardversuch, der viele ISO-Formate abdeckt
            parsedDate = new Date(dateString);
        }

        // Einheitliche Überprüfung am Ende: Ist das Ergebnis ein gültiges Datum?
        if (parsedDate instanceof Date && !isNaN(parsedDate.getTime())) {
            return parsedDate;
        } else {
            logToDb(jobId, 'WARN', `Ungültiges Datumsformat im Feed erkannt und ignoriert: "${dateString}"`);
            return null;
        }
    } catch (error) {
        logToDb(jobId, 'ERROR', `Fehler beim Parsen des Datums "${dateString}": ${error.message}`);
        return null;
    }
};

// Helfer-Funktion zum Entfernen von HTML-Tags
const sanitizeHtml = (htmlString) => {
    if (!htmlString) return null;
    const $ = cheerio.load(htmlString);
    return $.text();
};

// Helfer-Funktion zur Extraktion von Schlagwörtern basierend auf DB-Tags
const extractTags = (text, availableTags) => {
    if (!text || !availableTags) return [];
    const foundTagIds = new Set();
    const lowercasedText = text.toLowerCase();
    
    availableTags.forEach(tag => {
        // Prüft, ob der Tag-Name (als ganzes Wort oder Teil) im Text vorkommt
        if (lowercasedText.includes(tag.name.toLowerCase())) {
            foundTagIds.add(tag.id);
        }
    });
    
    return Array.from(foundTagIds);
};

// Die Kern-Scraping-Funktion
async function scrapeRule(jobId, rule, availableTags) {
    const { url_pattern: sourceUrl, source_identifier: sourceIdentifier, region: ruleRegion, id: ruleId, date_format: dateFormat } = rule;
    await logToDb(jobId, 'INFO', `Starte Verarbeitung für Quelle: ${sourceIdentifier} von ${sourceUrl}`);
    
    try {
        const response = await axios.get(sourceUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive',
            },
            timeout: 15000
        });
        
        const contentType = response.headers['content-type'] || '';
        const isXml = contentType.includes('xml') || contentType.includes('rss') || sourceUrl.endsWith('.xml') || sourceUrl.endsWith('.rss');

        if (isXml) {
            await logToDb(jobId, 'INFO', 'Quelle als XML/RSS-Feed erkannt.');
            const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const result = await parser.parseStringPromise(response.data);
            const items = result.rss?.channel?.item || result.feed?.entry || [];
            const feedItems = Array.isArray(items) ? items : [items];
            let itemsProcessed = 0;

            if (sourceIdentifier.includes('traffic')) {
                await logToDb(jobId, 'INFO', `Verarbeite ${feedItems.length} Einträge für die Tabelle 'traffic_incidents'.`);
                for (const item of feedItems) {
                    const title = item.title || 'Unbekannte Meldung';
                    const description = item.description || null;
                    const link = item.link?.href || item.link || null;
                    const guid = item.guid?._ || item.guid || link;
                    if (!guid) {
                        await logToDb(jobId, 'WARN', `Eintrag ohne guid oder link übersprungen: ${title}`);
                        continue;
                    }
                    
                    const rawDate = item.pubDate || item.updated;
                    const pubDate = parseDateString(rawDate, dateFormat, jobId);

                    await db.query(
                        `INSERT INTO traffic_incidents (title, description, link, published_at, road_name, region, type, source_identifier, scraping_rule_id, original_item_guid)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         ON CONFLICT (link) DO UPDATE SET 
                            description = EXCLUDED.description, 
                            published_at = EXCLUDED.published_at, 
                            title = EXCLUDED.title;`,
                        [title, description, link, pubDate, title.split(',')[0], ruleRegion, 'Stau', sourceIdentifier, ruleId, guid]
                    );
                    itemsProcessed++;
                }
            } else {
                await logToDb(jobId, 'INFO', `Verarbeite ${feedItems.length} Einträge für die Tabelle 'scraped_content'.`);
                for (const item of feedItems) {
                    const link = item.link?.href || item.link || null;
                    if (!link) continue;
                    
                    const rawTitle = item.title?._ || item.title || 'Kein Titel';
                    const rawDescription = item.description?._ || item.summary?._ || item.description || item.summary || null;
                    const rawDate = item.pubDate || item.updated;
                    
                    const cleanTitle = sanitizeHtml(rawTitle);
                    const cleanDescription = sanitizeHtml(rawDescription);
                    const combinedText = `${cleanTitle} ${cleanDescription}`;
                    const foundTagIds = extractTags(combinedText, availableTags);

                    let publishedDate = null;
                    let eventDate = null;
                    const parsedDate = parseDateString(rawDate, dateFormat, jobId);

                    if (rule.category_default === 'event') {
                        eventDate = parsedDate;
                    } else {
                        publishedDate = parsedDate;
                    }

                    const insertContentQuery = `
                        INSERT INTO scraped_content (source_identifier, original_url, title, summary, published_date, event_date, category, region)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (original_url) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, published_date = EXCLUDED.published_date
                        RETURNING id;`;
                    
                    const contentResult = await db.query(insertContentQuery, [sourceIdentifier, link, cleanTitle, cleanDescription, publishedDate, eventDate, rule.category_default, ruleRegion]);
                    
                    if (contentResult.rows.length > 0 && foundTagIds.length > 0) {
                        const scrapedContentId = contentResult.rows[0].id;
                        await logToDb(jobId, 'INFO', `Inhalt ${scrapedContentId} erstellt/gefunden. Verknüpfe ${foundTagIds.length} Tags...`);

                        for (const tagId of foundTagIds) {
                            await db.query(
                                `INSERT INTO scraped_content_tags (scraped_content_id, tag_id)
                                 VALUES ($1, $2)
                                 ON CONFLICT DO NOTHING;`,
                                [scrapedContentId, tagId]
                            );
                        }
                    }
                    itemsProcessed++;
                }
            }
            await logToDb(jobId, 'INFO', `Erfolgreich ${itemsProcessed} von ${feedItems.length} Einträgen verarbeitet.`);
        } else {
            await logToDb(jobId, 'WARN', 'HTML-Scraping ist in diesem Beispiel nicht vollständig implementiert.');
        }
        
        await db.query('UPDATE scraping_rules SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = $1', [ruleId]);
    } catch (error) {
        await logToDb(jobId, 'ERROR', `Fehler bei der Verarbeitung von ${sourceUrl}: ${error.message}`);
        throw error;
    }
}

// Diese Funktion wird für den manuellen Trigger von der API aufgerufen
async function triggerSingleRuleScrape(ruleId, jobId) {
    try {
        await db.query(`UPDATE scraping_jobs SET status = 'running' WHERE id = $1`, [jobId]);
        
        const ruleResult = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [ruleId]);
        if (ruleResult.rows.length === 0) {
            throw new Error(`Scraping-Regel mit ID ${ruleId} nicht gefunden.`);
        }
        const rule = ruleResult.rows[0];

        const tagsResult = await db.query('SELECT id, name FROM tags');
        const availableTags = tagsResult.rows;

        await scrapeRule(jobId, rule, availableTags);

        await db.query(`UPDATE scraping_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
        await logToDb(jobId, 'INFO', 'Job erfolgreich abgeschlossen.');
    } catch(err) {
        console.error(`[Scraper] Critical error during single job scrape for jobId ${jobId}:`, err.message);
        await logToDb(jobId, 'ERROR', `Job mit kritischem Fehler abgebrochen: ${err.message}`);
        await db.query(`UPDATE scraping_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
    }
}

async function startAllScrapingJobs() {
    console.log(`[Scraper] Starting all scheduled scraping jobs...`);
    
    try {
        const scrapingRulesResult = await db.query(`SELECT * FROM scraping_rules WHERE is_active = TRUE`);
        const activeScrapingRules = scrapingRulesResult.rows;
        
        const tagsResult = await db.query('SELECT id, name FROM tags');
        const availableTags = tagsResult.rows;
        
        console.log(`[Scraper] Found ${activeScrapingRules.length} active rules and ${availableTags.length} tags to process.`);

        // NEU: Detailliertes Logging für jede einzelne Regel
        for (const rule of activeScrapingRules) {
            const jobResult = await db.query(
                `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
                [rule.id]
            );
            const jobId = jobResult.rows[0].id;
            
            const logDetails = { 
                source: rule.source_identifier, 
                url: rule.url_pattern,
                ruleId: rule.id,
                jobId: jobId
            };

            // Protokolliere den Start des spezifischen Jobs
            await logActivity({ actionType: 'SCRAPING_RULE_START', status: 'success', targetId: rule.id, targetType: 'scraping_rule', details: logDetails });
            
            try {
                await db.query(`UPDATE scraping_jobs SET status = 'running' WHERE id = $1`, [jobId]);
                await scrapeRule(jobId, rule, availableTags);
                await db.query(`UPDATE scraping_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
                await logToDb(jobId, 'INFO', 'Job erfolgreich abgeschlossen.');
                
                // Protokolliere den Erfolg des spezifischen Jobs
                await logActivity({ actionType: 'SCRAPING_RULE_SUCCESS', status: 'success', targetId: rule.id, targetType: 'scraping_rule', details: logDetails });

            } catch(err) {
                console.error(`[Scraper] Critical error during single job scrape for jobId ${jobId}:`, err.message);
                await logToDb(jobId, 'ERROR', `Job mit kritischem Fehler abgebrochen: ${err.message}`);
                await db.query(`UPDATE scraping_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);

                // Protokolliere den Fehlschlag des spezifischen Jobs
                await logActivity({ 
                    actionType: 'SCRAPING_RULE_FAILURE', 
                    status: 'failure', 
                    targetId: rule.id, 
                    targetType: 'scraping_rule', 
                    details: { ...logDetails, error: err.message }
                });
            }
        }
        
        console.log('[Scraper] All scheduled scraping jobs cycle completed.');

    } catch (error) {
        console.error('[Scraper] Critical error during the main scraping process setup:', error.message);
        // Protokolliere einen Fehlschlag des gesamten Cronjobs, falls die Vorbereitung fehlschlägt
        await logActivity({
            actionType: 'CRON_JOB_SCRAPING_SETUP_FAILURE',
            status: 'failure',
            details: { error: error.message, stack: error.stack }
        });
    }
}

module.exports = {
    startAllScrapingJobs,
    triggerSingleRuleScrape,
};