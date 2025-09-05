// backend/workers/emailWorker.js
require('dotenv').config();
process.title = 'emailWorker';

const { Worker } = require('bullmq');
const { connection } = require('../services/queueService');
// KORREKTUR: Importieren Sie den Service, der die Arbeit erledigt, nicht den Controller.
const { generateAndSendDailyReport } = require('../services/reportingService');

console.log('[mail] Worker-Prozess startet...');

const worker = new Worker(
  'emails',
  async (job) => {
    console.log(`[mail] Verarbeite Job ${job.id} (${job.name})`);
    try {
      const { emailJobId } = job.data;
      if (!emailJobId) {
        throw new Error('emailJobId fehlt im Job-Payload');
      }

      // KORREKTUR: Rufen Sie die Funktion auf, die den Report tatsächlich erstellt und sendet.
      console.log(`[mail] Starte generateAndSendDailyReport für emailJobId: ${emailJobId}`);
      await generateAndSendDailyReport(emailJobId);
      console.log(`[mail] generateAndSendDailyReport für ${emailJobId} erfolgreich abgeschlossen.`);

    } catch (err) {
      console.error(
        `[mail] Fehler bei Job ${job.id} (${job.name}):`,
        err?.stack || err?.message || err
      );
      throw err; // Wichtig: Job als 'failed' markieren
    }
  },
  {
    connection,
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