// backend/services/aiService.js
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisierung der Clients mit den Schlüsseln aus der .env-Datei.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

/**
 * Normalisiert das Token-Usage-Objekt von verschiedenen Anbietern
 * für eine einheitliche Struktur im Logging.
 * @param {string} provider - 'openai' oder 'gemini'.
 * @param {object} usage - Das usage-Objekt von der API.
 * @returns {object|null} - Ein normalisiertes Objekt oder null.
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
 * @returns {Promise<object>} Ein Objekt mit Inhalt, Token-Nutzung und Modell.
 */
async function callOpenAI(prompt, model = 'gpt-4') {
    if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY nicht gesetzt. Simuliere KI-Antwort.');
        return {
            content: `Dies ist eine simulierte KI-Antwort für das Modell ${model}.`,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: model
        };
    }
    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: model,
        }, {
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
 * @returns {Promise<object>} Ein Objekt mit Inhalt, Token-Nutzung und Modell.
 */
async function callGoogleGemini(prompt, model = 'gemini-1.5-flash') {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
        console.warn('GOOGLE_GEMINI_API_KEY nicht gesetzt. Simuliere KI-Antwort.');
         return {
            content: `Dies ist eine simulierte KI-Antwort für das Modell ${model}.`,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: model
        };
    }
    try {
        const geminiModel = genAI.getGenerativeModel({ model: model });
        const result = await geminiModel.generateContent(prompt);
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
 */
async function executePrompt(provider, prompt) {
    console.log(`[AI Service] Executing prompt with provider: ${provider}`);
    switch (provider) {
        case 'OpenAI GPT-4':
            return callOpenAI(prompt, 'gpt-4');
        case 'OpenAI GPT-3.5':
             return callOpenAI(prompt, 'gpt-3.5-turbo');
        case 'Google Gemini':
            return callGoogleGemini(prompt, 'gemini-1.5-flash');
        default:
            throw new Error(`Unbekannter AI Provider: ${provider}`);
    }
}

// KORREKTUR: Die Funktion 'callOpenAI' wird jetzt exportiert.
module.exports = { executePrompt, callOpenAI };
