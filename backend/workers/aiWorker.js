// backend/workers/aiWorker.js
require('dotenv').config();
process.title = 'aiWorker';

const { Worker } = require('bullmq');
const { connection } = require('../services/queueService');

// Services/Controller, die NICHT server.js benötigen:
const { generateAndSaveContentForManualJob } = require('../controllers/adminAIPromptRulesController');
const { processSubscription, processSystemSubscription } = require('../services/intelligentContentService');
const { updateAllCommodityPrices } = require('../services/updateCommodityPrices');

console.log('[ai] Worker-Prozess startet...');

const worker = new Worker(
  'ai-content-generation',
  async (job) => {
    console.log(`[ai] Verarbeite Job ${job.id} (${job.name})`);
    try {
      switch (job.name) {
        case 'manual-generation': {
          const { jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId } = job.data;
          await generateAndSaveContentForManualJob(jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId);
          break;
        }
        case 'subscription-processing': {
          const { subscription } = job.data;
          await processSubscription(subscription);
          break;
        }
        case 'system-job-processing': {
          const { systemSubscription } = job.data;
          await processSystemSubscription(systemSubscription);
          break;
        }
        case 'update_commodity_prices': {
          await updateAllCommodityPrices();
          break;
        }
        default:
          throw new Error(`Unbekannter Job-Typ: ${job.name}`);
      }
    } catch (err) {
      console.error(`[ai] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
      throw err; // wichtig, damit BullMQ den Job als failed markiert
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);

worker.on('completed', (job) => console.log(`[ai] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[ai] failed ${job?.id} (${job?.name}):`, err?.message));
console.log('[ai] Worker läuft und wartet auf Jobs...');
