// backend/workers/emailWorker.js
require('dotenv').config();
process.title = 'emailWorker';
const workerName = 'emailWorker';

const { Worker } = require('bullmq');
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');
const { generateAndSendDailyReport, generateAndSendWeeklyReport, generateAndSendMonthlyReport } = require('../services/reportingService');
const { processSavedSearchNotifications } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService'); // Import für zukünftige Flexibilität hinzugefügt

console.log('[mail] Worker-Prozess startet...');

const worker = new Worker('emails', async (job) => {
    console.log(`[mail] Verarbeite Job ${job.id} (${job.name})`);
    
    try {
        switch (job.name) {
            case 'daily-report':
                console.log(`[mail] Starte generateAndSendDailyReport...`);
                await generateAndSendDailyReport();
                break;
            
            // +++ PLATZHALTER FÜR WÖCHENTLICHEN REPORT +++
            case 'weekly-report':
                console.log(`[mail] Starte generateAndSendWeeklyReport...`);
                // HINWEIS: Du musst die Funktion generateAndSendWeeklyReport im reportingService erstellen.
                await generateAndSendWeeklyReport();
                break;
            
            // +++ PLATZHALTER FÜR MONATLICHEN REPORT +++
            case 'monthly-report':
                console.log(`[mail] Starte generateAndSendMonthlyReport...`);
                // HINWEIS: Du musst die Funktion generateAndSendMonthlyReport im reportingService erstellen.
                await generateAndSendMonthlyReport();
                break;

            case 'saved-search-notifications':
                console.log(`[mail] Starte processSavedSearchNotifications...`);
                await processSavedSearchNotifications();
                break;

            default:
                throw new Error(`Unbekannter E-Mail-Job-Typ: ${job.name}`);
        }

        console.log(`[mail] Job "${job.name}" erfolgreich abgeschlossen.`);
    } catch (err) {
        console.error(`[mail] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
        throw err; // Wichtig: Job als 'failed' markieren
    }
}, {
    connection: redisClient,
    concurrency: 3,
    limiter: { max: 10, duration: 1000 },
});

worker.on('completed', (job) => console.log(`[mail] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[mail] failed ${job?.id} (${job?.name}):`, err?.message));
console.log('[mail] Worker läuft und wartet auf Jobs...');

setInterval(() => {
  heartbeatRedisClient.set(`worker_heartbeat:${workerName}`, new Date().toISOString(), 'EX', 60)
    .catch(err => console.error(`[mail-Heartbeat] FEHLER:`, err.message));
}, 15000);