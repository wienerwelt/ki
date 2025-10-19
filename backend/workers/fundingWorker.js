// backend/workers/fundingWorker.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
process.title = 'fundingWorker';
const workerName = 'fundingWorker'; 

const { Worker } = require('bullmq');
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');
const { extractAndSaveFunding } = require('../services/fundingService');

console.log(`[${workerName}] Worker-Prozess startet...`);

const worker = new Worker('funding-extraction', async (job) => {
    console.log(`[${workerName}] Verarbeite Job: ${job.name} (ID: ${job.id})`);
    try {
        await extractAndSaveFunding(job.data);
    } catch (err) {
        console.error(`[${workerName}] Fehler bei Job ${job.id} (${job.name}):`, err.stack || err.message || err);
        throw err;
    }
}, { 
    connection: redisClient,
    concurrency: 3, // Starten Sie mit einer niedrigeren Parallelität als der AI-Worker
    limiter: { max: 5, duration: 1000 },
});

worker.on('completed', (job) => console.log(`[${workerName}] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[${workerName}] failed ${job?.id} (${job?.name}):`, err?.message));
console.log(`[${workerName}] Worker läuft und wartet auf Jobs in der "funding-extraction"-Queue...`);

// Heartbeat-Logik (kopiert von anderen Workern)
setInterval(() => {
  heartbeatRedisClient.set(`worker_heartbeat:${workerName}`, new Date().toISOString(), 'EX', 60)
    .catch(err => console.error(`[${workerName}-Heartbeat] FEHLER:`, err.message));
}, 15000);