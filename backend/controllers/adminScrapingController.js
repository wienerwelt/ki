const db = require('../config/db');
// const { triggerSingleRuleScrape } = require('../services/scraperService');
const { scrapeQueue } = require('../services/queueService');

// Manuelles Triggern eines Scrapes (z. B. über Admin-UI Button)
// Legt einen DB-Job an (für dein Dashboard) und enqueued dann in die Queue.
exports.triggerScrapeJob = async (req, res) => {
    const { id: ruleId } = req.params;

    try {
        const jobResult = await db.query(
            `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
            [ruleId]
        );
        const jobId = jobResult.rows[0].id;

        // Sofort Antwort an UI
        res.status(202).json({ message: 'Scrape enqueued', jobId });

        // In die Queue stellen (Worker übernimmt)
        await scrapeQueue.add(
            'run-rule',
            { ruleId, jobId },
            { jobId: `scrape:${ruleId}:${Date.now()}` }
        );

        // Hinweis: kein Direktaufruf mehr! (triggerSingleRuleScrape wurde entfernt)

    } catch (err) {
        console.error('Error starting scrape job:', err);
        res.status(500).json({ message: 'Job konnte nicht gestartet werden.' });
    }
};

// Logs eines Jobs abrufen (ändert sich nicht)
exports.getScrapeLogs = async (req, res) => {
    const { jobId } = req.params;
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
        console.error('Error fetching scrape logs:', err);
        res.status(500).json({ message: 'Logs konnten nicht geladen werden.' });
    }
};
