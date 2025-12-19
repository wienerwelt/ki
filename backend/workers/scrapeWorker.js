// backend/workers/scrapeWorker.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
process.title = 'scrapeWorker';
const workerName = 'scrapeWorker'; 

const { Worker } = require('bullmq');
// KORREKTUR: Nutze die zentrale Heartbeat-Verbindung aus dem queueService
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');

const db = require('../config/db');

// GEÄNDERT: triggerNewsSearchForAll entfernt, da jetzt im dataUpdateWorker
const { triggerSingleRuleScrape, processNewsKeywordSearch } = require('../services/scraperService');

console.log('[scrape] Worker-Prozess startet...');


const worker = new Worker(
  'scrape-content-generation',
  async (job) => {
    console.log(`[scrape] Verarbeite Job ${job.id} (${job.name})`);
    try {
      // Wir verwenden ein switch-Statement für saubere Logik
      switch (job.name) {
        case 'news-keyword-search':
          await processNewsKeywordSearch(job.data);
          break;
        
        // ENTFERNT: case 'trigger-account-intelligence' ist jetzt im dataUpdateWorker

        default:
          // Bestehende Logik für regelbasiertes Scraping
          const { ruleId, jobId: providedJobId } = job.data;
          let jobId = providedJobId;
          if (!jobId) {
            const { rows } = await db.query(
              `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1,'pending') RETURNING id`,
              [ruleId]
            );
            jobId = rows[0].id;
          }
          await triggerSingleRuleScrape(ruleId, jobId);
          break;
      }
    } catch (err) {
      console.error(`[scrape] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
      throw err;
    }
  },
  { connection: redisClient }
);

worker.on('completed', (job) => console.log(`[scrape] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[scrape] failed ${job?.id} (${job?.name}):`, err?.message));
console.log('[scrape] Worker läuft und wartet auf Jobs...');

setInterval(() => {
  // Der Heartbeat nutzt jetzt die zentrale, importierte Verbindung
  heartbeatRedisClient.set(`worker_heartbeat:${workerName}`, new Date().toISOString(), 'EX', 60)
    .catch(err => {
      console.error(`[scrape-Heartbeat] FEHLER: Konnte Heartbeat nicht an Redis senden:`, err.message);
    });
}, 15000);

console.log(`[${workerName}-Worker] Heartbeat-Monitoring gestartet.`);