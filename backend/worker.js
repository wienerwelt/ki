// backend/worker.js

// Lade die Umgebungsvariablen aus der .env-Datei.
// Diese Zeile muss ganz am Anfang stehen!
require('dotenv').config();

const { Worker } = require('bullmq');
const { connection } = require('./services/queueService');
const { generateAndSaveContentForManualJob } = require('./controllers/adminAIPromptRulesController');
const { processSubscription, processSystemSubscription } = require('./services/intelligentContentService');
// NEU: Importiere die Funktion zum Aktualisieren der Rohstoffpreise
const { updateAllCommodityPrices } = require('./services/updateCommodityPrices');

console.log('Worker-Prozess startet...');

// Erstelle einen neuen Worker, der auf die Warteschlange 'ai-content-generation' hört.
const worker = new Worker('ai-content-generation', async (job) => {
    console.log(`[Worker] Verarbeite Job ${job.id} mit Namen: ${job.name}`);
    
    // Unterscheide zwischen verschiedenen Job-Typen
    if (job.name === 'manual-generation') {
        const { jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId } = job.data;
        await generateAndSaveContentForManualJob(jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId);
    
    } else if (job.name === 'subscription-processing') {
        const { subscription } = job.data;
        await processSubscription(subscription);

    } else if (job.name === 'system-job-processing') {
        const { systemSubscription } = job.data;
        await processSystemSubscription(systemSubscription);

    // NEU: Fügt die Logik für den neuen Job-Typ hinzu
    } else if (job.name === 'update_commodity_prices') {
        await updateAllCommodityPrices();
        
    } else {
        throw new Error(`Unbekannter Job-Typ: ${job.name}`);
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
    console.error(`[Worker] Job ${job.id} (Name: ${job.name}) fehlgeschlagen:`, err.message);
    console.error(err.stack);
});

console.log('Worker läuft und wartet auf Jobs...');
