// backend/services/intelligentContentService.js
const db = require('../config/db');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { generateAIContent } = require('./aiExecutionService');
const { searchGoogle } = require('./googleSearchService');
// KORREKTUR: Importiert den neuen, vereinheitlichten Service
const { scrapeUrl } = require('./scrapingService'); 
const { logActivity } = require('./auditLogService');
const { callOpenAI } = require('./aiService');
const { aiContentQueue } = require('./queueService');

// Erstellt einen eindeutigen "Fingerabdruck" aus Keywords und Region
const createKeywordsHash = (keywords, region) => {
    const sortedKeywords = [...keywords].sort().join(',');
    const hashString = `${sortedKeywords.toLowerCase()}:${region.toLowerCase()}`;
    return crypto.createHash('sha256').update(hashString).digest('hex');
};

/**
 * Prüft mit einer schnellen KI-Anfrage, ob der Text relevant ist.
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
            details: { url: articleUrl, keywords: keywords, decision: decision ? 'JA' : 'NEIN', aiResponse: answer },
            username: 'System'
        });

        console.log(`[Relevance Check] For ${articleUrl} -> AI decision: ${answer}`);
        return decision;
    } catch (error) {
        console.error('Fehler bei der KI-Relevanzprüfung:', error.message);
        await logActivity({
            actionType: 'AI_RELEVANCE_CHECK',
            status: 'failure',
            details: { url: articleUrl, keywords: keywords, error: error.message },
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

/**
 * Hauptfunktion, die den gesamten intelligenten Prozess steuert.
 * Wird vom Worker aufgerufen.
 */
const processSubscription = async (subscription) => {
    const { ai_prompt_rule_id: ruleId, region, keywords, id: subscriptionId, user_id: userId } = subscription;
    const keywordsHash = createKeywordsHash(keywords, region);
    const client = await db.connect();
    let jobId;

    try {
        const cacheQuery = `SELECT generated_content_id FROM generated_content_cache WHERE ai_prompt_rule_id = $1 AND region = $2 AND keywords_hash = $3 AND created_at > NOW() - INTERVAL '24 hours'`;
        const cacheResult = await client.query(cacheQuery, [ruleId, region, keywordsHash]);
        if (cacheResult.rows.length > 0) {
            console.log(`[IntelliService] Cache Hit für Abo ${subscriptionId}! Prozess wird nicht neu gestartet.`);
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
        
        const searchOptions = { countryCode: countryCode };
        
        const searchResults = await searchGoogle(searchQuery, searchOptions);
        if (searchResults.length === 0) {
            console.log(`[IntelliService - Job ${jobId}] Keine Suchergebnisse für die Anfrage gefunden.`);
            await client.query(`UPDATE ai_jobs SET status = 'completed_no_results' WHERE id = $1`, [jobId]);
            return;
        }

        let articleSummaries = [];
        for (const { link } of searchResults.slice(0, 5)) {
            // KORREKTUR: Ruft die neue, vereinheitlichte Funktion auf
            const scrapedText = await scrapeUrl(link); 
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

        let contentToStore = aiResultString;
        let finalTitle = `Hot Topics: ${keywords.join(', ')}`;
        let finalKeywords = keywords;
        let finalCategoryId = rule.default_category_id;

        if (rule.output_format === 'json') {
            try {
                const parsedResult = JSON.parse(aiResultString);
                contentToStore = parsedResult.content || contentToStore;
                finalTitle = parsedResult.title || finalTitle;
                finalKeywords = parsedResult.keywords || finalKeywords;
                if (parsedResult.category) {
                     const foundCategoryRes = await client.query('SELECT id FROM categories WHERE name ILIKE $1', [parsedResult.category.trim()]);
                     if (foundCategoryRes.rows.length > 0) {
                         finalCategoryId = foundCategoryRes.rows[0].id;
                     }
                }
            } catch(e) {
                console.error(`[IntelliService - Job ${jobId}] Fehler beim Parsen des erwarteten JSON-Outputs. Speichere rohen Text. Fehler:`, e.message);
            }
        }

        const newContentRes = await client.query(
            `INSERT INTO ai_generated_content (id, ai_prompt_rule_id, job_id, title, generated_output, region, user_id, keywords, category_id, output_format) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [uuidv4(), ruleId, jobId, finalTitle, contentToStore, region, userId, finalKeywords, finalCategoryId, rule.output_format]
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
        console.error(`[IntelliService] Fehler im Abo-Prozess (Job: ${jobId}, Abo: ${subscriptionId}):`, err.message);
        if (jobId) await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
    } finally {
        client.release();
    }
};

/**
 * Fügt alle aktiven Abonnements zur Job-Warteschlange hinzu.
 */
const processAllActiveSubscriptions = async () => {
    console.log(`[Cronjob] Starte das Hinzufügen aller aktiven Abonnements zur Job-Warteschlange...`);
    const client = await db.connect();
    try {
        const activeSubsRes = await client.query(`SELECT * FROM content_subscriptions WHERE is_active = TRUE`);
        const subscriptions = activeSubsRes.rows;
        
        if (subscriptions.length === 0) {
            console.log('[Cronjob] Keine aktiven Abonnements gefunden.');
            return;
        }
        
        console.log(`[Cronjob] Füge ${subscriptions.length} aktive Abonnements zur Warteschlange hinzu.`);
        for (const subscription of subscriptions) {
            await aiContentQueue.add('subscription-processing', { subscription });
        }
        console.log(`[Cronjob] Alle Abonnements erfolgreich zur Verarbeitung übergeben.`);

    } catch (err) {
        console.error('[Cronjob] Fehler beim Hinzufügen der Abos zur Warteschlange:', err.message);
    } finally {
        client.release();
    }
};

module.exports = {
    processSubscription,
    processAllActiveSubscriptions
};
