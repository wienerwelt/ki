// backend/services/aiService.js
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisierung der Clients mit den Schlüsseln aus der .env-Datei.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

/**
 * Normalisiert das Token-Usage-Objekt von verschiedenen Anbietern
 * für eine einheitliche Struktur im Logging.
 */
const normalizeUsage = (provider, usage) => {
    if (!usage) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    if (provider === 'openai') {
        return {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens
        };
    }
    if (provider === 'gemini') {
        return {
            promptTokens: usage.promptTokenCount,
            completionTokens: usage.candidatesTokenCount,
            totalTokens: usage.totalTokenCount
        };
    }
    return null;
};

/**
 * Interne Funktion für OpenAI-Aufrufe.
 * @param {string} prompt - Der an die KI zu sendende Prompt.
 * @param {string} model - Das zu verwendende OpenAI-Modell.
 * @param {object} options - Zusätzliche Parameter (z.B. responseFormat).
 * @returns {Promise<object>} Ein Objekt mit Inhalt, Token-Nutzung und Modell.
 */
async function callOpenAI(prompt, model = 'gpt-4', options = {}) {
    if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY nicht gesetzt. Simuliere KI-Antwort.');
        return {
            content: options.responseFormat?.type === 'json_object' 
                ? '{"simulated": true, "model": "' + model + '"}' 
                : `Dies ist eine simulierte KI-Antwort für das Modell ${model}.`,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: model
        };
    }
    try {
        // Basis-Konfiguration für den API-Aufruf
        const messages = [];
        if (options.systemPrompt) {
            messages.push({ role: 'system', content: String(options.systemPrompt) });
        }
        messages.push({ role: 'user', content: String(prompt || '') });

        const apiConfig = {
            messages,
            model: model,
        };

        if (Number.isFinite(Number(options.maxOutputTokens)) && Number(options.maxOutputTokens) > 0) {
            apiConfig.max_tokens = Math.min(Number(options.maxOutputTokens), 4000);
        }
        if (Number.isFinite(Number(options.temperature))) {
            apiConfig.temperature = Math.max(0, Math.min(Number(options.temperature), 2));
        }

        // NEU: Wenn responseFormat (JSON-Mode) gefordert ist, anfügen
        if (options.responseFormat && options.responseFormat.type === 'json_object') {
            apiConfig.response_format = { type: 'json_object' };
        }

        const completion = await openai.chat.completions.create(apiConfig, {
            timeout: 60000, // Timeout nach 60 Sekunden
            maxRetries: 1,
        });

        return {
            content: completion.choices[0].message.content,
            usage: normalizeUsage('openai', completion.usage),
            model: model
        };
    } catch (error) {
        console.error("OpenAI API Error:", error);
        if (error instanceof OpenAI.APIError) {
            throw new Error(`Fehler von OpenAI API: ${error.status} ${error.name} - ${error.message}`);
        }
        throw new Error("Fehler bei der Anfrage an die OpenAI API.");
    }
}

/**
 * Interne Funktion für Google Gemini-Aufrufe.
 * @param {string} prompt - Der an die KI zu sendende Prompt.
 * @param {string} model - Das zu verwendende Gemini-Modell.
 * @param {object} options - Zusätzliche Parameter (z.B. responseFormat).
 * @returns {Promise<object>} Ein Objekt mit Inhalt, Token-Nutzung und Modell.
 */
async function callGoogleGemini(prompt, model = 'gemini-1.5-flash', options = {}) {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
        console.warn('GOOGLE_GEMINI_API_KEY nicht gesetzt. Simuliere KI-Antwort.');
         return {
            content: options.responseFormat?.type === 'json_object' 
                ? '{"simulated": true, "model": "' + model + '"}' 
                : `Dies ist eine simulierte KI-Antwort für das Modell ${model}.`,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: model
        };
    }
    try {
        const modelConfig = { model: model };
        
        // NEU: Gemini JSON-Mode Unterstützung
        if (options.responseFormat && options.responseFormat.type === 'json_object') {
            modelConfig.generationConfig = {
                responseMimeType: "application/json"
            };
        }

        const geminiModel = genAI.getGenerativeModel(modelConfig);
        const finalPrompt = options.systemPrompt
            ? `${String(options.systemPrompt)}\n\n${String(prompt || '')}`
            : String(prompt || '');
        const result = await geminiModel.generateContent(finalPrompt);
        const response = await result.response;
        
        return {
            content: response.text(),
            usage: normalizeUsage('gemini', result.response.usageMetadata),
            model: model
        };
    } catch (error) {
        console.error("Google Gemini API Error:", error);
        throw new Error("Fehler bei der Anfrage an die Google Gemini API.");
    }
}

/**
 * Führt einen Prompt bei einem bestimmten KI-Anbieter aus.
 * @param {string} provider - Der Name des Providers
 * @param {string} prompt - Der auszuführende Text
 * @param {object} options - Zusätzliche Parameter (wie responseFormat)
 */

async function executePrompt(provider, prompt, options = {}) {
    console.log(`[AI Service] Executing prompt with provider: ${provider}${options.responseFormat?.type === 'json_object' ? ' (JSON Mode)' : ''}`);
    
    switch (provider) {
        case 'OpenAI GPT-4':
            return callOpenAI(prompt, 'gpt-4', options);
        case 'OpenAI GPT-4o':
            return callOpenAI(prompt, 'gpt-4o', options);
        case 'OpenAI GPT-4o-mini':
            return callOpenAI(prompt, 'gpt-4o-mini', options);
        case 'OpenAI GPT-3.5':
             return callOpenAI(prompt, 'gpt-3.5-turbo', options);            
        case 'Google Gemini':
            return callGoogleGemini(prompt, 'gemini-1.5-flash', options);
        default:
            throw new Error(`Unbekannter AI Provider: ${provider}`);
    }
}

module.exports = { executePrompt, callOpenAI };
