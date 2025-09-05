// backend/controllers/adminScrapingRulesController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { getScrapingRuleSuggestion } = require('../services/scraperService');
const { scrapeQueue } = require('../services/queueService');
const jobManager = require('../services/jobManagerService');
const { parse } = require('date-fns');

const isValidUUID = (uuid) =>
    uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

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
        category_default, is_active, region, schedule, scrape_after_date
    } = req.body;

    if (!source_identifier || !url_pattern || !category_default) {
        return res.status(400).json({ message: 'Source Identifier, URL und Standard-Kategorie sind Pflichtfelder.' });
    }

    try {
        const newRuleRes = await db.query(
            `INSERT INTO scraping_rules (id, name, source_identifier, url_pattern, content_container_selector, title_selector, date_selector, description_selector, link_selector, date_format, category_default, is_active, region, schedule, scrape_after_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
            [
                uuidv4(), name, source_identifier, url_pattern, content_container_selector, title_selector,
                date_selector, description_selector, link_selector, date_format, category_default,
                is_active, region, schedule, scrape_after_date
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
        category_default, is_active, region, schedule, scrape_after_date
    } = req.body;

    try {
        const result = await db.query(
            `UPDATE scraping_rules SET
             name = $1, source_identifier = $2, url_pattern = $3, content_container_selector = $4,
             title_selector = $5, date_selector = $6, description_selector = $7, link_selector = $8,
             date_format = $9, category_default = $10, is_active = $11, region = $12, schedule = $13,
             scrape_after_date = $14, updated_at = CURRENT_TIMESTAMP
             WHERE id = $15 RETURNING *`,
            [
                name, source_identifier, url_pattern, content_container_selector, title_selector,
                date_selector, description_selector, link_selector, date_format, category_default,
                is_active, region, schedule, scrape_after_date, id
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

// Manuelles Triggern: DB-Job anlegen + ENQUEUE in Queue 'scrape-content-generation'
exports.triggerScrapeJob = async (req, res) => {
    const { id: ruleId } = req.params;
    try {
        // --- NEU: Regeldetails abrufen, um einen Namen zu haben ---
        const ruleRes = await db.query('SELECT name, source_identifier FROM scraping_rules WHERE id = $1', [ruleId]);
        if (ruleRes.rows.length === 0) {
            return res.status(404).json({ message: 'Scraping-Regel nicht gefunden.' });
        }
        const rule = ruleRes.rows[0];
        const jobName = rule.name || rule.source_identifier; // Fallback auf source_identifier
        // --- ENDE NEU ---

        const jobResult = await db.query(
            `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
            [ruleId]
        );
        const jobId = jobResult.rows[0].id;

        await scrapeQueue.add(
            jobName, // ⬅️ GEÄNDERT: von 'run-rule' zum dynamischen Namen
            { ruleId, jobId },
            { jobId: `scrape:${ruleId}:${Date.now()}` } // Die ID kann so bleiben
        );

        return res.status(202).json({ message: 'Scrape enqueued', jobId });
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

        const logsRes = await db.query(
            'SELECT log_level, message, created_at FROM scraping_logs WHERE job_id = $1 ORDER BY created_at ASC',
            [jobId]
        );

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

exports.testDateFormat = async (req, res) => {
    const { dateString, formatString } = req.body;
    if (!dateString || !formatString) {
        return res.status(400).json({ message: 'dateString und formatString sind erforderlich.' });
    }
    try {
        const referenceDate = new Date();
        const parsedDate = parse(dateString, formatString, referenceDate);
        if (!isNaN(parsedDate.getTime())) {
            res.json({
                success: true,
                message: 'Format ist korrekt.',
                parsedResult: parsedDate.toISOString(),
            });
        } else {
            throw new Error('Das resultierende Datum ist ungültig.');
        }
    } catch (err) {
        res.status(400).json({
            success: false,
            message: 'Format-Fehler: Das angegebene Format passt nicht auf den Datums-String.',
        });
    }
};

exports.inferDateFormat = async (req, res) => {
    const { dateString } = req.body;
    if (!dateString) {
        return res.status(400).json({ message: 'Ein Beispiel-Datumsstring (dateString) ist erforderlich.' });
    }
    const formatsToTry = [
        'd.M.yy HH:mm:ss', 'dd.MM.yyyy HH:mm:ss', 'yyyy-MM-dd HH:mm:ss',
        'd.M.yy HH:mm', 'dd.MM.yyyy HH:mm', 'd. MMMM yyyy, HH:mm', 'yyyy-MM-dd HH:mm',
        'dd.MM.yy', 'd.MM.yy', 'dd.M.yy', 'dd.MM.yyyy', 'd.MM.yyyy', 'dd.M.yyyy',
        'd. MMMM yyyy', 'd. MMM yyyy', 'yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy',
        "EEE, dd MMM yyyy HH:mm:ss 'GMT'", "EEE, dd MMM yyyy HH:mm:ss xx",
        "yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-M-d'T'H:m:sX", "yyyy-MM-dd'T'HH:mm:ssX",
        'dd-MM-yy', 'd-M-yy', 'dd-MM-yyyy',
    ];
    for (const format of formatsToTry) {
        try {
            const parsedDate = parse(dateString, format, new Date());
            if (!isNaN(parsedDate.getTime())) {
                return res.json({ success: true, format: format, message: `Format gefunden: ${format}` });
            }
        } catch (e) { /* weiterprobieren */ }
    }
    res.status(400).json({ success: false, message: 'Konnte kein passendes Datumsformat für den angegebenen Text finden.' });
};
