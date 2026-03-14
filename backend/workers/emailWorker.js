if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

process.title = 'emailWorker';
const workerName = 'emailWorker';

const { Worker } = require('bullmq');
const {
  connection: redisClient,
  heartbeatRedisClient,
  connectRedisClients,
} = require('../services/queueService');

const {
  generateAndSendDailyReport,
  generateAndSendWeeklyReport,
  generateAndSendMonthlyReport,
  generateAndSendBriefingNewsletters
} = require('../services/reportingService');

const { processSavedSearchNotifications } = require('../services/notificationService');

function logWorkerBoot() {
  console.log('==================================================');
  console.log(`[mail] ${workerName} startet...`);
  console.log('[mail] NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('[mail] REDIS_HOST:', process.env.REDIS_HOST || '127.0.0.1');
  console.log('[mail] REDIS_PORT:', process.env.REDIS_PORT || '6379');
  console.log('[mail] REDIS_URL gesetzt:', process.env.REDIS_URL ? 'ja' : 'nein');
  console.log('==================================================');
}

async function startWorker() {
  try {
    logWorkerBoot();

    console.log('[mail] Prüfe Redis-Verbindungen...');
    await connectRedisClients();
    console.log('[mail] Redis-Verbindungen sind bereit.');

    const worker = new Worker('emails', async (job) => {
      console.log(`[mail] Verarbeite Job ${job.id} (${job.name})`);

      try {
        switch (job.name) {
          case 'daily-briefing':
            console.log('[mail] Starte generateAndSendBriefingNewsletters...');
            await generateAndSendBriefingNewsletters();
            break;

          case 'daily-report':
            console.log('[mail] Starte generateAndSendDailyReport...');
            await generateAndSendDailyReport();
            break;

          case 'weekly-report':
            console.log('[mail] Starte generateAndSendWeeklyReport...');
            await generateAndSendWeeklyReport();
            break;

          case 'monthly-report':
            console.log('[mail] Starte generateAndSendMonthlyReport...');
            await generateAndSendMonthlyReport();
            break;

          case 'saved-search-notifications':
            console.log('[mail] Starte processSavedSearchNotifications...');
            await processSavedSearchNotifications();
            break;

          default:
            throw new Error(`Unbekannter E-Mail-Job-Typ: ${job.name}`);
        }

        console.log(`[mail] Job "${job.name}" erfolgreich abgeschlossen.`);
      } catch (err) {
        console.error(`[mail] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
        throw err;
      }
    }, {
      connection: redisClient,
      concurrency: 3,
      limiter: { max: 10, duration: 1000 },
    });

    worker.on('ready', () => console.log('[mail] Worker ready'));
    worker.on('active', (job) => console.log(`[mail] active ${job.id} (${job.name})`));
    worker.on('completed', (job) => console.log(`[mail] completed ${job.id} (${job.name})`));
    worker.on('failed', (job, err) => console.error(`[mail] failed ${job?.id} (${job?.name}):`, err?.message));
    worker.on('error', (err) => console.error('[mail] Worker error:', err.message));
    worker.on('closing', () => console.warn('[mail] Worker closing'));
    worker.on('closed', () => console.warn('[mail] Worker closed'));
    worker.on('stalled', (jobId) => console.warn(`[mail] Job stalled: ${jobId}`));

    console.log('[mail] Worker läuft und wartet auf Jobs...');

    setInterval(async () => {
      try {
        const key = `worker_heartbeat:${workerName}`;
        const value = new Date().toISOString();
        await heartbeatRedisClient.set(key, value, 'EX', 60);
        console.log(`[mail-heartbeat] OK -> ${key} = ${value}`);
      } catch (err) {
        console.error('[mail-heartbeat] FEHLER:', err.message);
      }
    }, 15000);

  } catch (err) {
    console.error('[mail] Kritischer Fehler beim Worker-Start:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[mail] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[mail] Uncaught Exception:', err);
});

startWorker();