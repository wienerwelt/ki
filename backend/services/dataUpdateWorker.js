// backend/workers/dataUpdateWorker.js
require('dotenv').config();
process.title = 'dataUpdateWorker';

const { Worker } = require('bullmq');
const { connection: redisClient } = require('../services/queueService');
const { updateDailyIndicators, updateMonthlyIndicators } = require('../services/updateCommodityPrices');

console.log('[data-update] Worker-Prozess startet...');

const worker = new Worker('data-updates', async (job) => {
    console.log(`[data-update] Verarbeite Job: ${job.name} (ID: ${job.id})`);

    try {
        switch (job.name) {
            case 'daily-indicators':
                await updateDailyIndicators();
                break;
            case 'monthly-indicators':
                await updateMonthlyIndicators();
                break;
            default:
                throw new Error(`Unbekannter Job-Name in der data-updates Queue: ${job.name}`);
        }
    } catch (err) {
        console.error(`[data-update] Fehler bei Job ${job.id} (${job.name}):`, err.stack || err.message || err);
        throw err;
    }
}, { connection: redisClient });

worker.on('completed', (job) => console.log(`[data-update] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[data-update] failed ${job?.id} (${job?.name}):`, err?.message));

console.log('[data-update] Worker läuft und wartet auf Jobs in der "data-updates"-Queue...');