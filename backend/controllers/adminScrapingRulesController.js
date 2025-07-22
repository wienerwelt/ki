// backend/controllers/adminScrapingRulesController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { triggerSingleRuleScrape, getScrapingRuleSuggestion } = require('../services/scraperService');
const jobManager = require('../services/jobManagerService');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

exports.getAllScrapingRules = async (req, res) => {
    try {
        const query = `
            SELECT
                r.*,
                (CASE
                    WHEN r.source_identifier LIKE '%traffic%' THEN (SELECT COUNT(*) FROM traffic_incidents ti WHERE ti.source_identifier = r.source_identifier)
                    ELSE (SELECT COUNT(*) FROM scraped_content sc WHERE sc.source_identifier = r.source_identifier)
                END)::INTEGER AS current_entry_count
            FROM
                scraping_rules r
            ORDER BY
                r.name ASC;
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all scraping rules:', err.message);
        res.status(500).send('Server error');
    }
};

exports.createScrapingRule = async (req, res) => {
    const {
        name, source_identifier, url_pattern, content_container_selector, title_selector,
        date_selector, description_selector, link_selector, date_format,
        category_default, is_active, region, schedule
    } = req.body;

    if (!source_identifier || !url_pattern || !category_default) {
        return res.status(400).json({ message: 'Source Identifier, URL und Standard-Kategorie sind Pflichtfelder.' });
    }

    try {
        const newRuleRes = await db.query(
            `INSERT INTO scraping_rules (id, name, source_identifier, url_pattern, content_container_selector, title_selector, date_selector, description_selector, link_selector, date_format, category_default, is_active, region, schedule)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [
                uuidv4(), name, source_identifier, url_pattern, content_container_selector, title_selector,
                date_selector, description_selector, link_selector, date_format, category_default,
                is_active, region, schedule
            ]
        );
        const newRule = newRuleRes.rows[0];

        if (newRule.schedule) {
            await jobManager.setScrapingSchedule(newRule.id, newRule.schedule);
        }

        res.status(201).json(newRule);
    } catch (err) {
        console.error('Error creating scraping rule:', err.message);
        res.status(500).send('Server error');
    }
};

exports.updateScrapingRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const {
        name, source_identifier, url_pattern, content_container_selector, title_selector,
        date_selector, description_selector, link_selector, date_format,
        category_default, is_active, region, schedule
    } = req.body;

    try {
        const result = await db.query(
            `UPDATE scraping_rules SET
             name = $1, source_identifier = $2, url_pattern = $3, content_container_selector = $4,
             title_selector = $5, date_selector = $6, description_selector = $7, link_selector = $8,
             date_format = $9, category_default = $10, is_active = $11, region = $12, schedule = $13,
             updated_at = CURRENT_TIMESTAMP
             WHERE id = $14 RETURNING *`,
            [
                name, source_identifier, url_pattern, content_container_selector, title_selector,
                date_selector, description_selector, link_selector, date_format, category_default,
                is_active, region, schedule, id
            ]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });
        
        const updatedRule = result.rows[0];
        
        await jobManager.setScrapingSchedule(updatedRule.id, updatedRule.schedule);

        res.json(updatedRule);
    } catch (err) {
        console.error('Error updating scraping rule:', err.message);
        res.status(500).send('Server error');
    }
};

exports.deleteScrapingRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        await jobManager.removeScrapingSchedule(id);
        
        const result = await db.query('DELETE FROM scraping_rules WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });
        
        res.json({ message: 'Scraping rule deleted successfully.' });
    } catch (err) {
        console.error('Error deleting scraping rule:', err.message);
        res.status(500).send('Server error');
    }
};

exports.updateScrapingRuleSchedule = async (req, res) => {
    const { id } = req.params;
    const { schedule } = req.body;

    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const { rows } = await db.query(
            'UPDATE scraping_rules SET schedule = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [schedule, id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });

        await jobManager.setScrapingSchedule(id, schedule);

        res.status(200).json({ message: 'Zeitplan erfolgreich aktualisiert.' });
    } catch (err) {
        console.error(`Error updating schedule for scraping rule ${id}:`, err.message);
        res.status(500).send('Server error');
    }
};

exports.triggerScrapeJob = async (req, res) => {
    const { id: ruleId } = req.params;
    try {
        const jobResult = await db.query(
            `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
            [ruleId]
        );
        const jobId = jobResult.rows[0].id;
        
        triggerSingleRuleScrape(ruleId, jobId).catch(err => {
            console.error(`[FATAL] Unhandled error from background scrape job ${jobId}:`, err.message);
        });

        res.status(202).json({ message: 'Scraping-Job gestartet.', jobId });
    } catch (err) {
        console.error('Error initiating scrape job:', err.message);
        res.status(500).json({ message: 'Job konnte nicht initialisiert werden.' });
    }
};

exports.getScrapeLogs = async (req, res) => {
    const { jobId } = req.params;
    if (!isValidUUID(jobId)) return res.status(400).json({ message: 'Invalid Job ID format.' });
    try {
        const jobStatusRes = await db.query('SELECT status FROM scraping_jobs WHERE id = $1', [jobId]);
        if (jobStatusRes.rows.length === 0) {
            return res.status(404).json({ message: 'Job nicht gefunden.' });
        }
        
        const logsRes = await db.query('SELECT log_level, message, created_at FROM scraping_logs WHERE job_id = $1 ORDER BY created_at ASC', [jobId]);
        
        res.json({
            status: jobStatusRes.rows[0].status,
            logs: logsRes.rows,
        });
    } catch (err) {
        console.error('Error fetching scrape logs:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getSuggestionForUrl = async (req, res) => {
    const { url } = req.body;
    const { id: userId } = req.user;
    try {
        const suggestion = await getScrapingRuleSuggestion(url, userId);
        res.json(suggestion);
    } catch (err) {
        console.error('Error getting scraping rule suggestion:', err.message);
        res.status(500).json({ message: err.message });
    }
};
