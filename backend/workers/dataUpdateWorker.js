// backend/workers/dataUpdateWorker.js
require('dotenv').config();
process.title = 'dataUpdateWorker';
const workerName = 'dataUpdateWorker'; 

const { Worker } = require('bullmq');
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');
const { updateDailyIndicators, updateMonthlyIndicators } = require('../services/updateCommodityPrices');
const { generateBriefingsForAllPartners } = require('../services/marketBriefingService');

console.log(`[${workerName}] Worker-Prozess startet...`);

const worker = new Worker('data-updates', async (job) => {
    console.log(`[${workerName}] Verarbeite Job: ${job.name} (ID: ${job.id})`);

    try {
        switch (job.name) {
            case 'daily-market-briefing':
                await generateBriefingsForAllPartners();
                break;            
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
        console.error(`[${workerName}] Fehler bei Job ${job.id} (${job.name}):`, err.stack || err.message || err);
        throw err;
    }
}, { connection: redisClient });

worker.on('completed', (job) => console.log(`[${workerName}] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[${workerName}] failed ${job?.id} (${job?.name}):`, err?.message));

console.log(`[${workerName}] Worker läuft und wartet auf Jobs in der "data-updates"-Queue...`);

setInterval(() => {
  // Der Heartbeat nutzt jetzt die zentrale, importierte Verbindung
  heartbeatRedisClient.set(`worker_heartbeat:${workerName}`, new Date().toISOString(), 'EX', 60)
    .catch(err => {
      console.error(`[${workerName}-Heartbeat] FEHLER: Konnte Heartbeat nicht an Redis senden:`, err.message);
    });
}, 15000);

console.log(`[${workerName}] Heartbeat-Monitoring gestartet.`);