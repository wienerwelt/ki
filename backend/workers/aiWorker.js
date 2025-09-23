require('dotenv').config();
process.title = 'aiWorker';
const workerName = 'aiWorker'; 

const { Worker } = require('bullmq');
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');

const { generateAndSaveContentForManualJob } = require('../controllers/adminAIPromptRulesController');
const { processSubscription, processSystemSubscription } = require('../services/intelligentContentService');

console.log('[ai] Worker-Prozess startet...');

const worker = new Worker(
  'ai-content-generation',
  async (job) => {
    console.log(`[ai] Verarbeite Job ${job.id} (${job.name})`);
    try {
      switch (job.name) {
        case 'manual-generation': {
          const { jobId, ruleToExecute, inputText, region, categoryId, focus_page, userId } = job.data;
          await generateAndSaveContentForManualJob(jobId, ruleToExecute, inputText, region, categoryId, focus_page, userId);
          break;
        }
        case 'subscription-processing': {
          const { subscription } = job.data;
          await processSubscription(subscription);
          break;
        }
        case 'system-job-processing': {
          // --- HIER IST DIE KORREKTUR ---
          // Wir übergeben das gesamte `job.data`-Objekt, nicht nur einen Teil davon.
          await processSystemSubscription(job.data);
          break;
        }
        default:
          throw new Error(`Unbekannter Job-Typ: ${job.name}`);
      }
    } catch (err) {
      console.error(`[ai] Fehler bei Job ${job.id} (${job.name}):`, err.stack || err.message || err);
      throw err;
    }
  },
  {
    connection: redisClient,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);

worker.on('completed', (job) => console.log(`[ai] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[ai] failed ${job?.id} (${job?.name}):`, err?.message));
console.log('[ai] Worker läuft und wartet auf Jobs...');

setInterval(() => {
  heartbeatRedisClient.set(`worker_heartbeat:${workerName}`, new Date().toISOString(), 'EX', 60)
    .catch(err => {
      console.error(`[ai-Heartbeat] FEHLER: Konnte Heartbeat nicht an Redis senden:`, err.message);
    });
}, 15000);