// backend/services/fundingService.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { extractTextFromUrl } = require('./scraperService');
const { callOpenAI } = require('./aiService');

const buildFundingPrompt = (textContent) => {
    return `
Du bist ein Experte für die Analyse von Förderungsrichtlinien. Deine Aufgabe ist es, den folgenden Text zu analysieren und die Kerninformationen als valides JSON-Objekt zu extrahieren. Halte dich exakt an das vorgegebene Format. Gib NUR das JSON zurück.
WICHTIGE REGELN:
- Wenn eine Information nicht im Text zu finden ist, setze den Wert auf \`null\`.
- Datumsangaben müssen im Format YYYY-MM-DD extrahiert werden.
- Geldbeträge sollen als reine Zahl (Integer) extrahiert werden.
- Gib bei 'zielgruppen', 'thematische_kategorien' und 'foerderart' nur die passenden Werte aus dem vordefinierten Array zurück.
TEXT ZUR ANALYSE:
"""
${textContent.substring(0, 15000)}
"""
JSON-FORMAT:
{
  "foerderung_titel": "Der exakte, vollständige Titel der Förderung",
  "einreichfrist_start": "YYYY-MM-DD",
  "einreichfrist_ende": "YYYY-MM-DD",
  "foerderhoehe_min_eur": null,
  "foerderhoehe_max_eur": null,
  "foerderquote_prozent": null,
  "foerderart": ["Zuschuss", "Darlehen", "Bürgschaft", "Beratung", "Unbekannt"],
  "zielgruppen": ["KMU", "Großunternehmen", "Start-up / Gründer", "Forschungseinrichtung", "Privatperson", "Verein / NPO"],
  "thematische_kategorien": ["Umwelt & Energie", "Digitalisierung", "Forschung & Innovation", "Kunst & Kultur", "Mobilität", "Soziales"],
  "zusammenfassung_ki": "Fasse die Förderung in 2-3 prägnanten Sätzen für einen schnellen Überblick zusammen."
}
`;
};

const extractAndSaveFunding = async (jobData) => {
    const { sourceRuleId, articleUrl, region } = jobData;
    const client = await db.connect();
    let aiJobId;

    try {
        await client.query('BEGIN');

        // --- HIER IST DIE KORREKTUR ---
        // Der Job wird jetzt korrekt mit der scraping_rule_id verknüpft
        const jobRes = await client.query(
            `INSERT INTO ai_jobs (scraping_rule_id, status, is_automated) 
             VALUES ($1, 'running', TRUE) RETURNING id`,
            [sourceRuleId]
        );
        aiJobId = jobRes.rows[0].id;

        const textContent = await extractTextFromUrl(articleUrl);
        if (!textContent) throw new Error(`Kein Inhalt von ${articleUrl} extrahiert.`);

        const prompt = buildFundingPrompt(textContent);
        const { content, usage, model } = await callOpenAI(prompt, 'gpt-4o');

        if (usage && usage.totalTokens > 0) {
            await client.query(
                `INSERT INTO ai_usage_logs (job_id, ai_provider, model, prompt_tokens, completion_tokens, total_tokens) VALUES ($1, $2, $3, $4, $5, $6)`,
                [aiJobId, 'OpenAI', model, usage.promptTokens, usage.completionTokens, usage.totalTokens]
            );
        }

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Kein valides JSON-Objekt im KI-Output gefunden.");
        const data = JSON.parse(jsonMatch[0]);

        const { rows: [opportunity] } = await client.query(
            `INSERT INTO funding_opportunities (id, source_rule_id, ai_job_id, original_url, title, summary_ai, deadline_start, deadline_end, funding_amount_min, funding_amount_max, funding_rate_percent, region, raw_ai_response)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (original_url) DO UPDATE SET
                title = EXCLUDED.title, summary_ai = EXCLUDED.summary_ai, deadline_end = EXCLUDED.deadline_end, updated_at = NOW()
             RETURNING id`,
            [
                uuidv4(), sourceRuleId, aiJobId, articleUrl, data.foerderung_titel, data.zusammenfassung_ki,
                data.einreichfrist_start || null, data.einreichfrist_ende || null,
                data.foerderhoehe_min_eur || null, data.foerderhoehe_max_eur || null,
                data.foerderquote_prozent || null, region, data
            ]
        );
        
        if (data.thematische_kategorien && Array.isArray(data.thematische_kategorien)) {
            for (const categoryName of data.thematische_kategorien) {
                let { rows: [cat] } = await client.query('SELECT id FROM funding_categories WHERE name = $1', [categoryName]);
                if (!cat) {
                    ({ rows: [cat] } = await client.query('INSERT INTO funding_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [categoryName]));
                }
                await client.query(
                    'INSERT INTO funding_opportunities_categories (opportunity_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [opportunity.id, cat.id]
                );
            }
        }
        
        await client.query(`UPDATE ai_jobs SET status = 'completed' WHERE id = $1`, [aiJobId]);
        await client.query('COMMIT');
    } catch (error) {
        console.error(`Funding extraction error for ${articleUrl}:`, error.message);
        if (aiJobId) {
            await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [aiJobId]);
        }
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { extractAndSaveFunding };