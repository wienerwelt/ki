// backend/workers/scrapeWorker.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

process.title = 'scrapeWorker';
const workerName = 'scrapeWorker';

const { Worker } = require('bullmq');
const {
  connection: redisClient,
  heartbeatRedisClient,
  connectRedisClients,
} = require('../services/queueService');

const db = require('../config/db');
const { triggerSingleRuleScrape, processNewsKeywordSearch } = require('../services/scraperService');

function logWorkerBoot() {
  console.log('==================================================');
  console.log(`[scrape] ${workerName} startet...`);
  console.log('[scrape] NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('[scrape] DB_HOST:', process.env.DB_HOST || 'undefined');
  console.log('[scrape] DB_PORT:', process.env.DB_PORT || 'undefined');
  console.log('[scrape] DB_DATABASE:', process.env.DB_DATABASE || 'undefined');
  console.log('[scrape] REDIS_HOST:', process.env.REDIS_HOST || '127.0.0.1');
  console.log('[scrape] REDIS_PORT:', process.env.REDIS_PORT || '6379');
  console.log('[scrape] REDIS_URL gesetzt:', process.env.REDIS_URL ? 'ja' : 'nein');
  console.log('==================================================');
}

async function startWorker() {
  try {
    logWorkerBoot();

    console.log('[scrape] Prüfe Redis-Verbindungen...');
    await connectRedisClients();
    console.log('[scrape] Redis-Verbindungen sind bereit.');

    console.log('[scrape] Prüfe PostgreSQL-Verbindung...');
    const dbCheck = await db.query('SELECT current_database(), version()');
    console.log('[scrape] PostgreSQL verbunden.');
    console.log('[scrape] Aktive DB:', dbCheck.rows[0].current_database);
    console.log('[scrape] PostgreSQL Version:', dbCheck.rows[0].version);

    const worker = new Worker(
      'scrape-content-generation',
      async (job) => {
        console.log(`[scrape] Verarbeite Job ${job.id} (${job.name})`);

        try {
          switch (job.name) {
            case 'news-keyword-search':
              await processNewsKeywordSearch(job.data);
              break;

            default: {
              const { ruleId, jobId: providedJobId } = job.data;
              let jobId = providedJobId;

              if (!jobId) {
                const { rows } = await db.query(
                  `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1,'pending') RETURNING id`,
                  [ruleId]
                );
                jobId = rows[0].id;
                console.log(`[scrape] Neuer scraping_job angelegt: ${jobId} für ruleId=${ruleId}`);
              }

              await triggerSingleRuleScrape(ruleId, jobId);
              break;
            }
          }

          console.log(`[scrape] Job "${job.name}" erfolgreich abgeschlossen.`);
        } catch (err) {
          console.error(`[scrape] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
          throw err;
        }
      },
      {
        connection: redisClient,
      }
    );

    worker.on('ready', () => console.log('[scrape] Worker ready'));
    worker.on('active', (job) => console.log(`[scrape] active ${job.id} (${job.name})`));
    worker.on('completed', (job) => console.log(`[scrape] completed ${job.id} (${job.name})`));
    worker.on('failed', (job, err) => console.error(`[scrape] failed ${job?.id} (${job?.name}):`, err?.message));
    worker.on('error', (err) => console.error('[scrape] Worker error:', err.message));
    worker.on('closing', () => console.warn('[scrape] Worker closing'));
    worker.on('closed', () => console.warn('[scrape] Worker closed'));
    worker.on('stalled', (jobId) => console.warn(`[scrape] Job stalled: ${jobId}`));

    console.log('[scrape] Worker läuft und wartet auf Jobs...');
    console.log('[scrape] Heartbeat-Monitoring gestartet.');

    setInterval(async () => {
      try {
        const key = `worker_heartbeat:${workerName}`;
        const value = new Date().toISOString();
        await heartbeatRedisClient.set(key, value, 'EX', 60);
        console.log(`[scrape-heartbeat] OK -> ${key} = ${value}`);
      } catch (err) {
        console.error('[scrape-heartbeat] FEHLER:', err.message);
      }
    }, 15000);

  } catch (err) {
    console.error('[scrape] Kritischer Fehler beim Worker-Start:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[scrape] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[scrape] Uncaught Exception:', err);
});

startWorker();