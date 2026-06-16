// backend/services/googleSearchService.js
const axios = require('axios');
const { logActivity } = require('./auditLogService');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX_ID = process.env.GOOGLE_CX_ID;
const GOOGLE_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

/**
 * Führt eine optimierte Google-Suche durch.
 * @param {string} query - Die Suchanfrage.
 * @param {object} [options={}] - Zusätzliche Optionen für die Suche.
 * @returns {Promise<Array<{title: string, link: string}>>} - Ein Array von Suchergebnis-Objekten.
 */
const searchGoogle = async (query, options = {}) => {
    const { countryCode, language, sortByDate } = options;

    const excludeFileTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    const fileTypeExclusions = excludeFileTypes.map(type => `-filetype:${type}`).join(' ');
    const finalQuery = `${query} ${fileTypeExclusions}`;

    const logDetails = { query: finalQuery, originalQuery: query, options };

    await logActivity({
        actionType: 'GOOGLE_SEARCH',
        status: 'info',
        details: logDetails,
        username: 'System'
    });

    if (!GOOGLE_API_KEY || !GOOGLE_CX_ID) {
        console.warn('\n!!! [DEBUG GoogleSearch] FEHLER: GOOGLE_API_KEY oder GOOGLE_CX_ID fehlen in der .env-Datei. Simuliere 0 Ergebnisse.');
        await logActivity({
            actionType: 'GOOGLE_SEARCH_SIMULATED',
            status: 'success',
            details: { ...logDetails, reason: 'API keys not set' },
            username: 'System'
        });
        return [];
    }

    try {
        const searchParams = {
            key: GOOGLE_API_KEY,
            cx: GOOGLE_CX_ID,
            q: finalQuery,
            num: 5
        };

        if (countryCode) searchParams.gl = countryCode;
        if (language) searchParams.lr = language;
        if (sortByDate) searchParams.sort = 'date';

        // --- DEBUG LOGGING: ANFRAGE ---
        console.log(`\n======================================================`);
        console.log(`[DEBUG GoogleSearch] Sende Anfrage an Google API...`);
        console.log(`[DEBUG GoogleSearch] Suchbegriff (q):`, searchParams.q);
        console.log(`[DEBUG GoogleSearch] Weitere Parameter:`, { num: searchParams.num, lr: searchParams.lr, sort: searchParams.sort });

        const response = await axios.get(GOOGLE_SEARCH_API_URL, { 
            params: searchParams,
            headers: {
                'Referer': 'https://dashboard.mobiliti.at' // Täuscht Google vor, die Anfrage käme von der Website
            }
        });

        // --- DEBUG LOGGING: ANTWORT ---
        console.log(`[DEBUG GoogleSearch] Antwort erhalten. HTTP Status:`, response.status);
        console.log(`[DEBUG GoogleSearch] Geschätzte Gesamt-Treffer bei Google:`, response.data.searchInformation?.totalResults || 0);

        if (response.data && response.data.items && response.data.items.length > 0) {
            console.log(`[DEBUG GoogleSearch] Top ${response.data.items.length} Ergebnisse von Google zurückgeliefert:`);
            
            const results = response.data.items.map((item, index) => {
                console.log(`   ${index + 1}. [${item.title}] -> ${item.link}`);
                return { title: item.title, link: item.link };
            });
            console.log(`======================================================\n`);

            await logActivity({
                actionType: 'GOOGLE_SEARCH_SUCCESS',
                status: 'success',
                details: { ...logDetails, resultsFound: results.length, urls: results.map(r => r.link) },
                username: 'System'
            });
            return results;
        } else {
            console.log(`[DEBUG GoogleSearch] Google hat ein leeres 'items'-Array zurückgegeben. (0 Treffer für diese exakte Suchanfrage)`);
            console.log(`======================================================\n`);
            
            await logActivity({
                actionType: 'GOOGLE_SEARCH_NO_RESULTS',
                status: 'success',
                details: logDetails,
                username: 'System'
            });
            return [];
        }
    } catch (error) {
        // --- DEBUG LOGGING: FEHLER ---
        const errorMessage = error.response ? error.response.data.error.message : error.message;
        console.error(`\n======================================================`);
        console.error(`[DEBUG GoogleSearch] FEHLER BEI DER GOOGLE API:`);
        console.error(`Status Code:`, error.response?.status || 'Kein Status');
        console.error(`Fehlermeldung:`, errorMessage);
        console.error(`======================================================\n`);
        
        await logActivity({
            actionType: 'GOOGLE_SEARCH_FAILURE',
            status: 'failure',
            details: { ...logDetails, error: errorMessage },
            username: 'System'
        });
        return [];
    }
};

module.exports = {
    searchGoogle
};