// backend/services/aiExecutionService.js
const db = require('../config/db');
const { executePrompt } = require('./aiService');
const { logActivity } = require('./auditLogService');

// Helfer-Funktion zum Schreiben von detaillierten Job-Logs in die 'ai_logs'-Tabelle
const logToDb = async (jobId, level, message) => {
    console.log(`[Job ${jobId}] [${level}] ${message}`);
    try {
        await db.query(
            `INSERT INTO ai_logs (job_id, log_level, message) VALUES ($1, $2, $3)`,
            [jobId, level, message]
        );
    } catch (dbError) {
        console.error(`FATAL: Could not write log to DB for jobId ${jobId}:`, dbError);
    }
};

/**
 * Baut den finalen Prompt und führt die KI-Analyse sicher aus, inklusive Logging.
 * @returns {Promise<{finalPrompt: string, aiResultString: string, tokenUsage: object}>} Ein Objekt mit dem finalen Prompt, dem KI-Ergebnis und der Token-Nutzung.
 */
const generateAIContent = async (params) => {
    const { promptTemplate, inputText, region, category, focusPage, ai_provider, jobId, userId } = params;

    await logToDb(jobId, 'INFO', 'Baue den finalen Prompt zusammen...');
    
    let finalPrompt = promptTemplate;
    finalPrompt = finalPrompt.replace(/{{data}}/g, inputText || '');
    finalPrompt = finalPrompt.replace(/{{region}}/g, region || '');
    finalPrompt = finalPrompt.replace(/{{category}}/g, category || '');
    finalPrompt = finalPrompt.replace(/{{focus_page}}/g, focusPage || '');
    
    await logToDb(jobId, 'INFO', `Finaler Prompt für ${ai_provider} wird vorbereitet.`);
    
    try {
        // KORREKTUR: Der finale Prompt wird jetzt mitprotokolliert.
        await logActivity({
            actionType: 'AI_ANALYSIS_START',
            status: 'info',
            details: { 
                jobId, 
                provider: ai_provider,
                prompt: finalPrompt // HINZUGEFÜGT: Der Prompt wird im Log gespeichert
            },
            userId: userId,
            username: 'System (Automated)'
        });
        
        await logToDb(jobId, 'INFO', `Sende Anfrage an KI-Provider: ${ai_provider}...`);
        
        const { content, usage, model } = await executePrompt(ai_provider, finalPrompt);
        
        await logToDb(jobId, 'INFO', `Antwort von KI (${ai_provider}) erfolgreich erhalten.`);
        
        await logActivity({
            actionType: 'AI_ANALYSIS_SUCCESS',
            status: 'success',
            details: { 
                jobId, 
                provider: ai_provider, 
                model: model,
                tokenUsage: usage,
                resultLength: content.length 
            },
            userId: userId,
            username: 'System (Automated)'
        });

        return { aiResultString: content, tokenUsage: usage };

    } catch (error) {
        await logToDb(jobId, 'ERROR', `Fehler bei der KI-Ausführung: ${error.message}`);
        await logActivity({
            actionType: 'AI_ANALYSIS_FAILURE',
            status: 'failure',
            details: { 
                jobId, 
                provider: ai_provider, 
                error: error.message,
                prompt: finalPrompt // HINZUGEFÜGT: Prompt auch im Fehlerfall loggen
            },
            userId: userId,
            username: 'System (Automated)'
        });
        throw error;
    }
};

module.exports = {
    generateAIContent
};
