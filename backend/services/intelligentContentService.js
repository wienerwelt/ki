// backend/services/intelligentContentService.js
const db = require('../config/db');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { generateAIContent } = require('./aiExecutionService');
const { searchGoogle } = require('./googleSearchService');
const { scrapeUrlText } = require('./genericScraperService');
const { logActivity } = require('./auditLogService');
const { callOpenAI } = require('./aiService');

// Erstellt einen eindeutigen "Fingerabdruck" aus Keywords und Region
const createKeywordsHash = (keywords, region) => {
    const sortedKeywords = [...keywords].sort().join(',');
    const hashString = `${sortedKeywords.toLowerCase()}:${region.toLowerCase()}`;
    return crypto.createHash('sha256').update(hashString).digest('hex');
};

/**
 * Prüft mit einer schnellen KI-Anfrage, ob der Text relevant ist.
 * @param {string} articleText - Der zu prüfende Text.
 * @param {string[]} keywords - Die relevanten Keywords.
 * @param {string} articleUrl - Die URL des Artikels für das Logging.
 * @returns {Promise<boolean>} - True, wenn der Inhalt relevant ist.
 */
async function isContentRelevant(articleText, keywords, articleUrl) {
    if (!articleText) return false;
    const prompt = `Antworte nur mit "JA" oder "NEIN". Bezieht sich der folgende TEXT hauptsächlich auf eines dieser Themen: "${keywords.join(', ')}"? TEXT: """${articleText.substring(0, 1500)}"""`;
    try {
        const { content } = await callOpenAI(prompt, 'gpt-3.5-turbo');
        const answer = content.trim().toUpperCase();
        const decision = answer.includes('JA');
        
        await logActivity({
            actionType: 'AI_RELEVANCE_CHECK',
            status: 'success',
            details: {
                url: articleUrl,
                keywords: keywords,
                decision: decision ? 'JA' : 'NEIN',
                aiResponse: answer
            },
            username: 'System'
        });

        console.log(`[Relevance Check] For ${articleUrl} -> AI decision: ${answer}`);
        return decision;
    } catch (error) {
        console.error('Fehler bei der KI-Relevanzprüfung:', error.message);
        await logActivity({
            actionType: 'AI_RELEVANCE_CHECK',
            status: 'failure',
            details: {
                url: articleUrl,
                keywords: keywords,
                error: error.message
            },
            username: 'System'
        });
        return false;
    }
}

/**
 * Fasst einen einzelnen Artikeltext mit einer KI-Anfrage zusammen.
 */
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
            details: { url: articleUrl, model, tokenUsage: usage, summaryLength: summary.length, summary }, 
            username: 'System' 
        });
        return summary;
    } catch (error) {
        console.error(`Fehler bei der Artikel-Zusammenfassung für ${articleUrl}:`, error.message);
        await logActivity({ actionType: 'AI_SUMMARIZATION_FAILURE', status: 'failure', details: { url: articleUrl, model: 'gpt-3.5-turbo', error: error.message }, username: 'System' });
        return '';
    }
}


/**
 * Hauptfunktion, die den gesamten intelligenten Prozess steuert.
 */
const processSubscription = async ({ ruleId, region, keywords, subscriptionId, userId }) => {
    const keywordsHash = createKeywordsHash(keywords, region);
    const client = await db.connect();
    let jobId;

    try {
        const cacheQuery = `SELECT generated_content_id FROM generated_content_cache WHERE ai_prompt_rule_id = $1 AND region = $2 AND keywords_hash = $3 AND created_at > NOW() - INTERVAL '24 hours'`;
        const cacheResult = await client.query(cacheQuery, [ruleId, region, keywordsHash]);
        if (cacheResult.rows.length > 0) {
            console.log(`[IntelliService] Cache Hit! Prozess wird nicht neu gestartet.`);
            return;
        }

        const jobRes = await client.query(`INSERT INTO ai_jobs (ai_prompt_rule_id, status, is_automated) VALUES ($1, 'pending', TRUE) RETURNING id`, [ruleId]);
        jobId = jobRes.rows[0].id;
        await client.query(`UPDATE ai_jobs SET status = 'running' WHERE id = $1`, [jobId]);

        const ruleResult = await client.query('SELECT * FROM ai_prompt_rules WHERE id = $1', [ruleId]);
        if (ruleResult.rows.length === 0) throw new Error(`Regel mit ID ${ruleId} nicht gefunden.`);
        const rule = ruleResult.rows[0];

        const regionResult = await client.query('SELECT code FROM regions WHERE name = $1', [region]);
        const countryCode = regionResult.rows.length > 0 ? regionResult.rows[0].code : null;

        const keywordsPart = keywords.map(kw => `"${kw}"`).join(' OR ');
        const searchQuery = `${keywordsPart} ${region}`.trim();
        
        const searchOptions = {
            countryCode: countryCode,
        };
        
        const searchResults = await searchGoogle(searchQuery, searchOptions);
        if (searchResults.length === 0) {
            console.log(`[IntelliService - Job ${jobId}] Keine Suchergebnisse für die Anfrage gefunden.`);
            await client.query(`UPDATE ai_jobs SET status = 'completed_no_results' WHERE id = $1`, [jobId]);
            return;
        }

        let articleSummaries = [];
        for (const { link, title } of searchResults.slice(0, 5)) {
            const scrapedText = await scrapeUrlText(link);
            if (scrapedText) {
                const relevant = await isContentRelevant(scrapedText, keywords, link);
                if (relevant) {
                    const summary = await getSummaryForArticle(scrapedText, link);
                    if(summary) {
                       articleSummaries.push(`--- Zusammenfassung von ${link} ---\n${summary}`);
                    }
                } else {
                    console.log(`[IntelliService - Job ${jobId}] Inhalt von ${link} als irrelevant eingestuft und übersprungen.`);
                }
            }
        }

        if (articleSummaries.length === 0) {
            console.log(`[IntelliService - Job ${jobId}] Konnte keine relevanten Inhalte finden oder zusammenfassen.`);
            await client.query(`UPDATE ai_jobs SET status = 'completed_no_summary' WHERE id = $1`, [jobId]);
            return;
        }
        
        const combinedSummaries = `Recherche-Ergebnisse für die Keywords: ${keywords.join(', ')}\n\n${articleSummaries.join('\n\n')}`;

        const { aiResultString } = await generateAIContent({
            promptTemplate: rule.prompt_template, inputText: combinedSummaries, region,
            ai_provider: rule.ai_provider, jobId, userId
        });

        // --- ERGEBNIS VERARBEITEN UND SPEICHERN (KORRIGIERT) ---
        let contentToStore = aiResultString;
        let title = `Hot Topics: ${keywords.join(', ')}`;
        let finalKeywords = keywords;
        let finalCategoryId = rule.default_category_id;

        // Nur parsen, wenn das erwartete Format JSON ist.
        if (rule.output_format === 'json') {
            try {
                const parsedResult = JSON.parse(aiResultString);
                contentToStore = parsedResult.content || contentToStore; // Fallback auf rohen String
                title = parsedResult.title || title; // Fallback auf Standardtitel
                finalKeywords = parsedResult.keywords || finalKeywords;
                if (parsedResult.category) {
                     const foundCategoryRes = await client.query('SELECT id FROM categories WHERE name ILIKE $1', [parsedResult.category.trim()]);
                     if (foundCategoryRes.rows.length > 0) {
                         finalCategoryId = foundCategoryRes.rows[0].id;
                     }
                }
            } catch(e) {
                console.error(`[IntelliService - Job ${jobId}] Fehler beim Parsen des erwarteten JSON-Outputs. Speichere rohen Text. Fehler:`, e.message);
                // Im Fehlerfall wird der `contentToStore` (der bereits der rohe String ist) und der Standardtitel verwendet.
            }
        }

        const newContentRes = await client.query(
            `INSERT INTO ai_generated_content (id, ai_prompt_rule_id, job_id, title, generated_output, region, user_id, keywords, category_id, output_format) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [uuidv4(), ruleId, jobId, title, contentToStore, region, userId, finalKeywords, finalCategoryId, rule.output_format]
        );
        const newContentId = newContentRes.rows[0].id;

        await client.query(
            `INSERT INTO generated_content_cache (ai_prompt_rule_id, region, keywords_hash, generated_content_id) VALUES ($1, $2, $3, $4)
             ON CONFLICT (ai_prompt_rule_id, region, keywords_hash) DO UPDATE SET generated_content_id = $4, created_at = CURRENT_TIMESTAMP`,
            [ruleId, region, keywordsHash, newContentId]
        );

        await client.query(`UPDATE ai_jobs SET status = 'completed' WHERE id = $1`, [jobId]);
        console.log(`[IntelliService - Job ${jobId}] Prozess erfolgreich abgeschlossen und gecached.`);
        
    } catch (err) {
        console.error(`[IntelliService] Fehler im intelligenten Content-Prozess (Job: ${jobId}):`, err.message);
        if (jobId) await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
    } finally {
        client.release();
    }
};

const processAllActiveSubscriptions = async () => {
    console.log(`[Cronjob] Starte Verarbeitung aller aktiven Content-Abonnements...`);
    const client = await db.connect();
    try {
        const activeSubsRes = await client.query(`SELECT id, user_id, ai_prompt_rule_id, region, keywords FROM content_subscriptions WHERE is_active = TRUE`);
        if (activeSubsRes.rows.length === 0) {
            console.log('[Cronjob] Keine aktiven Abonnements gefunden.');
            return;
        }
        console.log(`[Cronjob] ${activeSubsRes.rows.length} aktive Abonnements gefunden.`);
        for (const subscription of activeSubsRes.rows) {
            await processSubscription({
                ruleId: subscription.ai_prompt_rule_id,
                region: subscription.region,
                keywords: subscription.keywords,
                subscriptionId: subscription.id,
                userId: subscription.user_id,
            });
        }
    } catch (err) {
        console.error('[Cronjob] Fehler bei der Verarbeitung der Abos:', err.message);
    } finally {
        client.release();
    }
};

module.exports = {
    processSubscription,
    processAllActiveSubscriptions
};
