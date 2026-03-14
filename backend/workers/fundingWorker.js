// backend/workers/fundingWorker.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

process.title = 'fundingWorker';
const workerName = 'fundingWorker';

const { Worker } = require('bullmq');
const {
  connection: redisClient,
  heartbeatRedisClient,
  connectRedisClients
} = require('../services/queueService');

const { extractAndSaveFunding } = require('../services/fundingService');

function logWorkerBoot() {
  console.log('==================================================');
  console.log(`[funding] ${workerName} startet...`);
  console.log('[funding] NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('[funding] REDIS_HOST:', process.env.REDIS_HOST || '127.0.0.1');
  console.log('[funding] REDIS_PORT:', process.env.REDIS_PORT || '6379');
  console.log('[funding] REDIS_URL gesetzt:', process.env.REDIS_URL ? 'ja' : 'nein');
  console.log('==================================================');
}

async function startWorker() {
  try {
    logWorkerBoot();

    console.log('[funding] Prüfe Redis-Verbindungen...');
    await connectRedisClients();
    console.log('[funding] Redis-Verbindungen sind bereit.');

    const worker = new Worker(
      'funding-extraction',
      async (job) => {
        console.log(`[funding] Verarbeite Job: ${job.name} (ID: ${job.id})`);

        try {
          await extractAndSaveFunding(job.data);
          console.log(`[funding] Job "${job.name}" erfolgreich abgeschlossen.`);
        } catch (err) {
          console.error(`[funding] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
          throw err;
        }
      },
      {
        connection: redisClient,
        concurrency: 3,
        limiter: { max: 5, duration: 1000 },
      }
    );

    worker.on('ready', () => console.log('[funding] Worker ready'));
    worker.on('active', (job) => console.log(`[funding] active ${job.id} (${job.name})`));
    worker.on('completed', (job) => console.log(`[funding] completed ${job.id} (${job.name})`));
    worker.on('failed', (job, err) => console.error(`[funding] failed ${job?.id} (${job?.name}):`, err?.message));
    worker.on('error', (err) => console.error('[funding] Worker error:', err.message));
    worker.on('closing', () => console.warn('[funding] Worker closing'));
    worker.on('closed', () => console.warn('[funding] Worker closed'));
    worker.on('stalled', (jobId) => console.warn(`[funding] Job stalled: ${jobId}`));

    console.log('[funding] Worker läuft und wartet auf Jobs...');

    setInterval(async () => {
      try {
        const key = `worker_heartbeat:${workerName}`;
        const value = new Date().toISOString();
        await heartbeatRedisClient.set(key, value, 'EX', 60);
        console.log(`[funding-heartbeat] OK -> ${key} = ${value}`);
      } catch (err) {
        console.error('[funding-heartbeat] FEHLER:', err.message);
      }
    }, 15000);

  } catch (err) {
    console.error('[funding] Kritischer Fehler beim Worker-Start:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[funding] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[funding] Uncaught Exception:', err);
});

startWorker();