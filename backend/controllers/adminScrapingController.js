const db = require('../config/db');
const { triggerSingleRuleScrape } = require('../services/scraperService');

// KORREKTUR 1: Der Name der Funktion wurde an den Aufruf in der Routen-Datei angepasst.
exports.triggerScrapeJob = async (req, res) => {
    // KORREKTUR 2: Wir lesen den Parameter 'id' aus der URL und benennen ihn in 'ruleId' um.
    const { id: ruleId } = req.params;
    
    try {
        // Erstellt einen neuen Job-Eintrag in der DB
        const jobResult = await db.query(
            `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
            [ruleId]
        );
        const jobId = jobResult.rows[0].id;

        // Gibt die Job-ID sofort an das Frontend zurück
        res.status(202).json({ message: 'Scraping-Job gestartet.', jobId });

        // Startet den eigentlichen Scraping-Prozess im Hintergrund
        // und fängt eventuelle Abstürze mit .catch() ab, um den Server stabil zu halten.
        triggerSingleRuleScrape(ruleId, jobId).catch(err => {
            console.error(`[FATAL] Unhandled error from background scrape job ${jobId}:`, err.message);
        });

    } catch (err) {
        console.error('Error starting scrape job:', err);
        res.status(500).json({ message: 'Job konnte nicht gestartet werden.' });
    }
};

// Ruft die Logs für einen bestimmten Job ab
exports.getScrapeLogs = async (req, res) => {
    const { jobId } = req.params;
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
        console.error('Error fetching scrape logs:', err);
        res.status(500).json({ message: 'Logs konnten nicht geladen werden.' });
    }
};