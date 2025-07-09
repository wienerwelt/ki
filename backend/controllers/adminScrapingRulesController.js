const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { triggerSingleRuleScrape } = require('../services/scraperService');
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

exports.getScrapingRuleById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Scraping Rule ID format.' });
    try {
        const result = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Scraping Rule not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching scraping rule by ID:', err.message);
        res.status(500).send('Server error');
    }
};

exports.createScrapingRule = async (req, res) => {
    const { name, source_identifier, region, url_pattern, category_default, is_active, content_container_selector, title_selector, date_selector, description_selector, date_format } = req.body;
    if (!source_identifier) return res.status(400).json({ message: 'Source identifier is required.' });

    try {
        const newRule = await db.query(
            `INSERT INTO scraping_rules (id, name, source_identifier, region, url_pattern, category_default, is_active, content_container_selector, title_selector, date_selector, description_selector, date_format)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [uuidv4(), name || null, source_identifier, region || null, url_pattern || null, category_default || null, is_active, content_container_selector || null, title_selector || null, date_selector || null, description_selector || null, date_format || null]
        );
        res.status(201).json(newRule.rows[0]);
    } catch (err) {
        console.error('Error creating scraping rule:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'Eine Regel mit dieser Source ID existiert bereits.' });
        res.status(500).send('Server error');
    }
};

exports.updateScrapingRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const fields = req.body;
    // Entfernt leere Felder, damit sie nicht versehentlich null in der DB setzen
    const validFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ''));
    const fieldEntries = Object.entries(validFields);

    if (fieldEntries.length === 0) {
        return res.status(400).json({ message: 'No fields to update provided.' });
    }

    const setClauses = fieldEntries.map(([key], index) => `${key} = $${index + 1}`);
    const values = fieldEntries.map(([, value]) => value);
    
    const query = `
        UPDATE scraping_rules 
        SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $${values.length + 1} 
        RETURNING *
    `;
    values.push(id);

    try {
        const result = await db.query(query, values);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Rule not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating scraping rule:', err.message);
        res.status(500).send('Server error');
    }
};

exports.deleteScrapingRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const result = await db.query('DELETE FROM scraping_rules WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Rule not found.' });
        res.json({ message: 'Scraping Rule deleted successfully' });
    } catch (err) {
        console.error('Error deleting scraping rule:', err.message);
        res.status(500).send('Server error');
    }
};


// --- Funktionen für manuelle Scraping-Jobs ---

exports.triggerScrapeJob = async (req, res) => {
    const { id: ruleId } = req.params;
    if (!isValidUUID(ruleId)) return res.status(400).json({ message: 'Invalid Rule ID format.' });
    try {
        const jobResult = await db.query(
            `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
            [ruleId]
        );
        const jobId = jobResult.rows[0].id;
        res.status(202).json({ message: 'Scraping-Job gestartet.', jobId });
        triggerSingleRuleScrape(ruleId, jobId).catch(err => {
            console.error(`[FATAL] Unhandled error from background scrape job ${jobId}:`, err.message);
        });
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
        res.json({ status: jobStatusRes.rows[0].status, logs: logsRes.rows });
    } catch (err) {
        console.error('Error fetching scrape logs:', err.message);
        res.status(500).json({ message: 'Logs konnten nicht geladen werden.' });
    }
};