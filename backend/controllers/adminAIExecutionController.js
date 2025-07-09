// backend/controllers/adminAIExecutionController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { generateAIContent } = require('../services/aiExecutionService');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

exports.executeRule = async (req, res) => {
    const { ruleId, inputText, region, categoryId, source_reference, focus_page, keywords } = req.body;
    let jobId;

    try {
        const ruleRes = await db.query('SELECT * FROM ai_prompt_rules WHERE id = $1', [ruleId]);
        if (ruleRes.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });
        const rule = ruleRes.rows[0];

        const jobResult = await db.query(`INSERT INTO ai_jobs (ai_prompt_rule_id, status) VALUES ($1, 'running') RETURNING id`, [ruleId]);
        jobId = jobResult.rows[0].id;
        
        res.status(202).json({ jobId });

        (async () => {
            try {
                let categoryName = null;
                if (categoryId) {
                    const categoryRes = await db.query('SELECT name FROM categories WHERE id = $1', [categoryId]);
                    if (categoryRes.rows.length > 0) categoryName = categoryRes.rows[0].name;
                }
                
                const { finalPrompt, aiResultString } = await generateAIContent({
                    promptTemplate: rule.prompt_template, inputText: inputText, region: region,
                    category: categoryName, ai_provider: rule.ai_provider, jobId: jobId,
                    focusPage: focus_page, keywords: keywords // NEU
                });

                let contentToStore = aiResultString, finalCategoryId = categoryId, title = `Generiert von "${rule.name}"`;
                let finalKeywords = keywords || [];

                try {
                    const parsedResult = JSON.parse(aiResultString);
                    contentToStore = parsedResult.content || contentToStore;
                    title = parsedResult.title || title;
                    finalKeywords = parsedResult.keywords || finalKeywords;
                    if (parsedResult.category) {
                        const foundCategoryRes = await db.query('SELECT id FROM categories WHERE name ILIKE $1', [parsedResult.category.trim()]);
                        if (foundCategoryRes.rows.length > 0) {
                            finalCategoryId = foundCategoryRes.rows[0].id;
                        }
                    }
                } catch (e) {
                    // Ist kein JSON
                }
                
                await db.query(
                    `INSERT INTO ai_generated_content (id, ai_prompt_rule_id, job_id, category_id, region, title, generated_output, source_input_text, source_reference, output_format, prompt_snapshot, focus_page, keywords) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                    [uuidv4(), ruleId, jobId, finalCategoryId, region, title, contentToStore, inputText, source_reference, 'text', finalPrompt, focus_page, finalKeywords]
                );
                await db.query(`UPDATE ai_jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);

            } catch (error) {
                console.error(`[FATAL] Background job ${jobId} failed:`, error);
                if (jobId) {
                    await db.query(`UPDATE ai_jobs SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
                }
            }
        })();

    } catch (error) {
        console.error('Error initiating AI job:', error);
        res.status(500).json({ message: 'Fehler bei der Job-Initialisierung.', details: error.message });
    }
};

exports.getJobStatusAndLogs = async (req, res) => {
    const { jobId } = req.params;
    if (!isValidUUID(jobId)) {
        return res.status(400).json({ message: 'Invalid Job ID format.' });
    }
    try {
        const jobStatusRes = await db.query('SELECT status FROM ai_jobs WHERE id = $1', [jobId]);
        if (jobStatusRes.rows.length === 0) {
            return res.status(404).json({ message: 'Job nicht gefunden.' });
        }
        const status = jobStatusRes.rows[0].status;

        const logsRes = await db.query(
            'SELECT log_level, message, created_at FROM ai_logs WHERE job_id = $1 ORDER BY created_at ASC',
            [jobId]
        );
        
        let finalResult = null;
        if (status === 'completed') {
            const resultRes = await db.query('SELECT generated_output FROM ai_generated_content WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1', [jobId]);
            if (resultRes.rows.length > 0) {
                finalResult = resultRes.rows[0].generated_output;
            }
        }
        
        res.json({
            status: status,
            logs: logsRes.rows,
            result: finalResult
        });
    } catch (err) {
        console.error('Error fetching AI logs:', err);
        res.status(500).json({ message: 'Logs konnten nicht geladen werden.' });
    }
};