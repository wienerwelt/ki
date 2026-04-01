// backend/workers/aiWorker.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

process.title = 'aiWorker';
const workerName = 'aiWorker';

const { Worker } = require('bullmq');
const {
  connection: redisClient,
  heartbeatRedisClient,
  connectRedisClients,
} = require('../services/queueService');

const { generateAndSaveContentForManualJob } = require('../controllers/adminAIPromptRulesController');
const { processSubscription, processSystemSubscription } = require('../services/intelligentContentService');
const { generateBriefingsForAllPartners } = require('../services/marketBriefingService');

function logWorkerBoot() {
  console.log('==================================================');
  console.log(`[ai] ${workerName} startet...`);
  console.log('[ai] NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('[ai] REDIS_HOST:', process.env.REDIS_HOST || '127.0.0.1');
  console.log('[ai] REDIS_PORT:', process.env.REDIS_PORT || '6379');
  console.log('[ai] REDIS_URL gesetzt:', process.env.REDIS_URL ? 'ja' : 'nein');
  console.log('==================================================');
}

async function startWorker() {
  try {
    logWorkerBoot();

    console.log('[ai] Prüfe Redis-Verbindungen...');
    await connectRedisClients();
    console.log('[ai] Redis-Verbindungen sind bereit.');

    const worker = new Worker(
      'ai-content-generation',
      async (job) => {
        console.log(`[ai] Verarbeite Job ${job.id} (${job.name})`);

        try {
          switch (job.name) {
            case 'manual-generation': {
              const { jobId, ruleToExecute, inputText, region, categoryId, focus_page, userId } = job.data;
              await generateAndSaveContentForManualJob(
                jobId,
                ruleToExecute,
                inputText,
                region,
                categoryId,
                focus_page,
                userId
              );
              break;
            }

            case 'subscription-processing': {
              const { subscription } = job.data;
              await processSubscription(subscription);
              break;
            }

            case 'system-job-processing': {
              await processSystemSubscription(job.data);
              break;
            }

            case 'generate-editorial-briefings': {
              const { bpId } = job.data || {};
              console.log(`[ai] Starte Briefing-Generierung für Partner: ${bpId || 'ALLE'}`);
              await generateBriefingsForAllPartners(bpId);
              break;
            }

            default:
              throw new Error(`Unbekannter Job-Typ: ${job.name}`);
              
          }

          console.log(`[ai] Job "${job.name}" erfolgreich abgeschlossen.`);
        } catch (err) {
          console.error(`[ai] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
          throw err;
        }
      },
      {
        connection: redisClient,
        concurrency: 5,
        limiter: { max: 10, duration: 1000 },
      }
    );

    worker.on('ready', () => console.log('[ai] Worker ready'));
    worker.on('active', (job) => console.log(`[ai] active ${job.id} (${job.name})`));
    worker.on('completed', (job) => console.log(`[ai] completed ${job.id} (${job.name})`));
    worker.on('failed', (job, err) => console.error(`[ai] failed ${job?.id} (${job?.name}):`, err?.message));
    worker.on('error', (err) => console.error('[ai] Worker error:', err.message));
    worker.on('closing', () => console.warn('[ai] Worker closing'));
    worker.on('closed', () => console.warn('[ai] Worker closed'));
    worker.on('stalled', (jobId) => console.warn(`[ai] Job stalled: ${jobId}`));

    console.log('[ai] Worker läuft und wartet auf Jobs...');

    setInterval(async () => {
      try {
        const key = `worker_heartbeat:${workerName}`;
        const value = new Date().toISOString();
        await heartbeatRedisClient.set(key, value, 'EX', 60);
        console.log(`[ai-heartbeat] OK -> ${key} = ${value}`);
      } catch (err) {
        console.error('[ai-heartbeat] FEHLER:', err.message);
      }
    }, 15000);

  } catch (err) {
    console.error('[ai] Kritischer Fehler beim Worker-Start:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[ai] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[ai] Uncaught Exception:', err);
});

startWorker();