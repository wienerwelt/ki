// backend/worker.js
require('dotenv').config();

const { Worker } = require('bullmq');
const { connection } = require('./services/queueService');
const { generateAndSaveContentForManualJob } = require('./controllers/adminAIPromptRulesController');
const { processSubscription, processSystemSubscription } = require('./services/intelligentContentService');
const { updateAllCommodityPrices } = require('./services/updateCommodityPrices');

console.log('Worker-Prozess startet...');

const worker = new Worker('ai-content-generation', async (job) => {
    console.log(`[Worker] Verarbeite Job ${job.id} mit Namen: ${job.name}`);
    
    // NEU: Ein zentraler try-catch-Block für alle Jobs
    try {
        switch (job.name) {
            case 'manual-generation':
                const { jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId } = job.data;
                await generateAndSaveContentForManualJob(jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId);
                break;

            case 'subscription-processing':
                const { subscription } = job.data;
                await processSubscription(subscription);
                break;

            case 'system-job-processing':
                const { systemSubscription } = job.data;
                await processSystemSubscription(systemSubscription);
                break;

            case 'update_commodity_prices':
                await updateAllCommodityPrices();
                break;

            // Fügen Sie hier weitere bekannte Job-Namen hinzu
            // case 'scraping-rule-processing':
            //     // Fügen Sie die Logik für diesen Job hinzu, wenn sie existiert
            //     console.log('Job-Typ "scraping-rule-processing" wird noch nicht verarbeitet.');
            //     break;
                
            default:
                // Dieser Fall fängt alle unbekannten Job-Typen ab
                throw new Error(`Unbekannter Job-Typ: ${job.name}`);
        }
    } catch (error) {
        // Diese Zeile sorgt dafür, dass JEDER Fehler an BullMQ gemeldet wird
        console.error(`Fehler bei der Verarbeitung von Job ${job.id} (Name: ${job.name}):`, error.message);
        // Fehler weiterwerfen, damit der Job als "Failed" markiert wird
        throw error;
    }
}, { 
    connection,
    concurrency: 5,
    limiter: {
        max: 10,
        duration: 1000,
    },
});

worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (Name: ${job.name}) erfolgreich abgeschlossen.`);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} (Name: ${job.name}) ist fehlgeschlagen:`, err.message);
});

console.log('Worker läuft und wartet auf Jobs...');