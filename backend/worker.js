// backend/worker.js

// NEU: Lade die Umgebungsvariablen aus der .env-Datei.
// Diese Zeile muss ganz am Anfang stehen!
require('dotenv').config();

const { Worker } = require('bullmq');
const { connection } = require('./services/queueService');
const { generateAndSaveContentForManualJob } = require('./controllers/adminAIPromptRulesController');
const { processSubscription } = require('./services/intelligentContentService');

console.log('Worker-Prozess startet...');

// Erstelle einen neuen Worker, der auf die Warteschlange 'ai-content-generation' hört.
const worker = new Worker('ai-content-generation', async (job) => {
    console.log(`[Worker] Verarbeite Job ${job.id} mit Namen: ${job.name}`);
    
    // Unterscheide zwischen verschiedenen Job-Typen
    if (job.name === 'manual-generation') {
        // Job kommt von der Admin-Seite
        const { jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId } = job.data;
        await generateAndSaveContentForManualJob(jobId, ruleToExecute, inputText, region, categoryName, categoryId, focus_page, userId);
    } else if (job.name === 'subscription-processing') {
        // Job kommt von der automatischen Abo-Verarbeitung
        const { subscription } = job.data;
        await processSubscription(subscription);
    } else {
        throw new Error(`Unbekannter Job-Typ: ${job.name}`);
    }
}, { 
    connection,
    // Erhöhe das Timeout für einzelne Jobs, da KI-Aufrufe lange dauern können
    concurrency: 5, // Verarbeite bis zu 5 Jobs gleichzeitig
    limiter: {
        max: 10, // Maximal 10 Jobs
        duration: 1000, // pro Sekunde
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
