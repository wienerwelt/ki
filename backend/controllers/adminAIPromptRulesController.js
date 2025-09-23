// backend/controllers/adminAIPromptRulesController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { aiContentQueue } = require('../services/queueService');
const jobManager = require('../services/jobManagerService');

const PROMPT_SEPARATOR = '+++';

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

exports.getAllAIPromptRules = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM ai_prompt_rules ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all AI prompt rules:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getAIProviders = (req, res) => {
    const providers = ['Google Gemini', 'OpenAI GPT-4', 'OpenAI GPT-4o', 'Anthropic Claude'];
    res.json(providers);
};

exports.createAIPromptRule = async (req, res) => {
    const { name, prompt_persona, prompt_task, prompt_format, ai_provider, output_format, keywords, region, schedule, is_active, category_id, purpose } = req.body;
    if (!name || !prompt_persona || !prompt_task || !ai_provider) {
        return res.status(400).json({ message: 'Name, Persona, Aufgabe und KI-Provider sind Pflichtfelder.' });
    }
    try {
        const prompt_template = [prompt_persona, prompt_task, prompt_format || ''].join(PROMPT_SEPARATOR);
        const newRuleRes = await db.query(
            `INSERT INTO ai_prompt_rules (id, name, prompt_template, ai_provider, output_format, keywords, region, schedule, is_active, default_category_id, purpose)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [uuidv4(), name, prompt_template, ai_provider, output_format || 'text', keywords, region, schedule, is_active, category_id, purpose || 'content_generation']
        );
        const newRule = newRuleRes.rows[0];
        if (newRule.schedule && newRule.is_active && newRule.purpose !== 'funding_discovery') {
            await jobManager.setSystemSubscriptionSchedule(newRule.id, newRule.schedule);
        }
        res.status(201).json(newRule);
    } catch (err) {
        console.error('Error creating AI prompt rule:', err.message);
        res.status(500).send('Server error');
    }
};

exports.updateAIPromptRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    const { name, prompt_persona, prompt_task, prompt_format, ai_provider, output_format, keywords, region, schedule, is_active, category_id, purpose } = req.body;
    if (!name || !prompt_persona || !prompt_task || !ai_provider) {
        return res.status(400).json({ message: 'Name, Persona, Aufgabe und KI-Provider sind Pflichtfelder.' });
    }
    try {
        const prompt_template = [prompt_persona, prompt_task, prompt_format || ''].join(PROMPT_SEPARATOR);
        const result = await db.query(
            `UPDATE ai_prompt_rules SET 
             name = $1, prompt_template = $2, ai_provider = $3, output_format = $4, keywords = $5, 
             region = $6, schedule = $7, is_active = $8, default_category_id = $9, purpose = $10, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $11 RETURNING *`,
            [name, prompt_template, ai_provider, output_format || 'text', keywords, region, schedule, is_active, category_id, purpose || 'content_generation', id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });
        const updatedRule = result.rows[0];
        if (updatedRule.is_active && updatedRule.schedule && updatedRule.purpose !== 'funding_discovery') {
            await jobManager.setSystemSubscriptionSchedule(updatedRule.id, updatedRule.schedule);
        } else {
            await jobManager.removeSystemSubscriptionSchedule(updatedRule.id);
        }
        res.json(updatedRule);
    } catch (err) {
        console.error('Error updating AI prompt rule:', err.message);
        res.status(500).send('Server error');
    }
};

exports.deleteAIPromptRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        await jobManager.removeSystemSubscriptionSchedule(id);
        const result = await db.query('DELETE FROM ai_prompt_rules WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });
        res.json({ message: 'AI Prompt Rule deleted successfully' });
    } catch (err) {
        console.error('Error deleting AI prompt rule:', err.message);
        res.status(500).send('Server error');
    }
};

exports.duplicateAIPromptRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const originalRuleResult = await db.query('SELECT * FROM ai_prompt_rules WHERE id = $1', [id]);
        if (originalRuleResult.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });
        
        const originalRule = originalRuleResult.rows[0];
        const newName = `${originalRule.name} (Kopie)`;

        const newRule = await db.query(
            `INSERT INTO ai_prompt_rules (id, name, prompt_template, ai_provider, output_format, keywords, region, schedule, is_active, default_category_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [uuidv4(), newName, originalRule.prompt_template, originalRule.ai_provider, originalRule.output_format, originalRule.keywords, originalRule.region, null, false, originalRule.default_category_id]
        );
        res.status(201).json(newRule.rows[0]);
    } catch (err) {
        console.error('Error duplicating AI prompt rule:', err.message);
        res.status(500).send('Server error');
    }
};


exports.triggerRule = async (req, res) => {
    const { id: ruleId } = req.params;
    if (!isValidUUID(ruleId)) {
        return res.status(400).json({ message: 'Invalid ID format.' });
    }

    try {
        const ruleRes = await db.query('SELECT * FROM ai_prompt_rules WHERE id = $1', [ruleId]);
        if (ruleRes.rows.length === 0) {
            return res.status(404).json({ message: 'Die angegebene KI-Regel wurde nicht gefunden.' });
        }
        const rule = ruleRes.rows[0];

        if ((!rule.keywords || rule.keywords.length === 0) && rule.purpose === 'funding_discovery') {
            return res.status(400).json({ message: 'Förder-Scout-Regeln können nicht gestartet werden, da keine Keywords konfiguriert sind.' });
        }
        
        const jobResult = await db.query(
            `INSERT INTO ai_jobs (ai_prompt_rule_id, status, is_automated) VALUES ($1, 'pending', FALSE) RETURNING id`,
            [ruleId]
        );
        const jobId = jobResult.rows[0].id;

        // KORREKTUR: Wir übergeben das Job-Datum in der korrekten Struktur
        await aiContentQueue.add('system-job-processing', { 
            systemSubscription: rule, 
            jobId: jobId 
        });
        
        console.log(`[API] Manually triggered system job ${jobId} for rule ${ruleId}`);
        
        res.status(202).json({ message: 'Job wurde manuell zur Warteschlange hinzugefügt.', jobId: jobId });

    } catch (err) {
        console.error(`Error triggering rule ${ruleId}:`, err.message);
        res.status(500).send('Serverfehler');
    }
};


exports.executeRule = async (req, res) => {
    const { ruleId, ruleData, inputText, region, categoryId, focus_page } = req.body;
    const { id: userId } = req.user;
    if (!inputText) return res.status(400).json({ message: 'Eingabetext ist erforderlich.' });
    try {
        const jobRes = await db.query(
            `INSERT INTO ai_jobs (ai_prompt_rule_id, status, is_automated) VALUES ($1, 'pending', FALSE) RETURNING id`,
            [ruleId]
        );
        const jobId = jobRes.rows[0].id;
        await aiContentQueue.add('manual-generation', {
            jobId,
            ruleToExecute: { id: ruleId, ...ruleData },
            inputText,
            region,
            categoryId,
            focus_page,
            userId
        });
        res.status(202).json({ message: 'AI-Job zur Verarbeitung in die Warteschlange gestellt.', jobId: jobId });
    } catch (error) {
        console.error('Fehler beim Hinzufügen des manuellen AI-Jobs:', error);
        res.status(500).send('Serverfehler');
    }
};

// Diese Funktion ist für das Planen von NUTZER-Abos, nicht System-Jobs.
exports.scheduleRule = async (req, res) => {
    const { id: ruleId } = req.params;
    const { userId, keywords, region, schedule, categoryId } = req.body;
    if (!userId || !keywords || keywords.length === 0 || !schedule) {
        return res.status(400).json({ message: 'Benutzer, Keywords und ein Zeitplan sind erforderlich.' });
    }
    try {
        const newSubscriptionRes = await db.query(
            `INSERT INTO user_ai_content_subscriptions (user_id, ai_prompt_rule_id, region, keywords, schedule, is_active, category_id)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6)
             ON CONFLICT (user_id, ai_prompt_rule_id, region) 
             DO UPDATE SET keywords = EXCLUDED.keywords, schedule = EXCLUDED.schedule, category_id = EXCLUDED.category_id, is_active = TRUE, updated_at = CURRENT_TIMESTAMP
             RETURNING *;`,
            [userId, ruleId, region || null, keywords, schedule, categoryId || null]
        );
        const newSubscription = newSubscriptionRes.rows[0];
        await jobManager.setSubscriptionSchedule(newSubscription.id, newSubscription.schedule);
        res.status(201).json({ 
            message: 'Abonnement erfolgreich erstellt oder aktualisiert und geplant.', 
            subscription: newSubscription 
        });
    } catch (err) {
        console.error('Error creating/updating scheduled subscription:', err.message);
        res.status(500).send('Serverfehler');
    }
};

async function generateAndSaveContentForManualJob(jobId, rule, inputText, region, categoryName, categoryId, focus_page, userId) {
    const client = await db.connect();
    try {
        await client.query(`UPDATE ai_jobs SET status = 'running' WHERE id = $1`, [jobId]);
        const { aiResultString } = await generateAIContent({
            promptTemplate: rule.prompt_template, inputText, region,
            category: categoryName, focusPage: focus_page,
            ai_provider: rule.ai_provider, jobId, userId
        });

        let contentToStore = aiResultString;
        let title = rule.name;

        if (rule.output_format === 'json') {
             try {
                const jsonMatch = aiResultString.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("Kein valides JSON-Objekt im KI-Output gefunden.");
                const parsedResult = JSON.parse(jsonMatch[0]);
                title = parsedResult.title || title;
                contentToStore = parsedResult.content || aiResultString;
            } catch (e) {
                console.error(`[Job ${jobId}] Fehler beim Parsen des JSON-Outputs:`, e.message);
            }
        } else { 
            const lines = aiResultString.trim().split('\n');
            if (lines.length > 1 && lines[0].trim().length > 0) {
                const potentialTitle = lines[0].trim();
                if (potentialTitle.length < 150 && !potentialTitle.startsWith('-') && !potentialTitle.startsWith('*')) {
                    title = potentialTitle;
                    contentToStore = lines.slice(1).join('\n').trim();
                }
            }
        }
        await client.query(
            `INSERT INTO ai_generated_content (id, ai_prompt_rule_id, job_id, title, generated_output, region, user_id, category_id, output_format, source_input_text, prompt_snapshot, focus_page) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [uuidv4(), rule.id, jobId, title, contentToStore, region, null, categoryId, rule.output_format, inputText, rule.prompt_template, focus_page]
        );
        await client.query(`UPDATE ai_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,[jobId]);
        
    } catch (error) {
        console.error(`[Job ${jobId}] Hintergrundprozess fehlgeschlagen:`, error);
        await client.query(`UPDATE ai_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
    } finally {
        client.release();
    }
}
exports.generateAndSaveContentForManualJob = generateAndSaveContentForManualJob;



