// backend/workers/emailWorker.js
require('dotenv').config();
process.title = 'emailWorker';
const workerName = 'emailWorker'; 

const { Worker } = require('bullmq');
// KORREKTUR: Nutze die zentrale Heartbeat-Verbindung aus dem queueService
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');

const { generateAndSendDailyReport } = require('../services/reportingService');

console.log('[mail] Worker-Prozess startet...');

const worker = new Worker(
  'emails',
  async (job) => {
    console.log(`[mail] Verarbeite Job ${job.id} (${job.name})`);
    try {
      console.log(`[mail] Starte generateAndSendDailyReport...`);
      await generateAndSendDailyReport();
      console.log(`[mail] generateAndSendDailyReport erfolgreich abgeschlossen.`);
    } catch (err) {
      console.error(
        `[mail] Fehler bei Job ${job.id} (${job.name}):`,
        err?.stack || err?.message || err
      );
      throw err; // Wichtig: Job als 'failed' markieren
    }
  },
  {
    connection: redisClient,
    concurrency: 3,
    limiter: { max: 10, duration: 1000 },
  }
);

worker.on('completed', (job) =>
  console.log(`[mail] completed ${job.id} (${job.name})`)
);
worker.on('failed', (job, err) =>
  console.error(`[mail] failed ${job?.id} (${job?.name}):`, err?.message)
);

console.log('[mail] Worker läuft und wartet auf Jobs...');

setInterval(() => {
  // Der Heartbeat nutzt jetzt die zentrale, importierte Verbindung
  heartbeatRedisClient.set(`worker_heartbeat:${workerName}`, new Date().toISOString(), 'EX', 60)
    .catch(err => {
      console.error(`[mail-Heartbeat] FEHLER: Konnte Heartbeat nicht an Redis senden:`, err.message);
    });
}, 15000);

console.log(`[${workerName}-Worker] Heartbeat-Monitoring gestartet.`);