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
        console.warn('!!! GOOGLE_API_KEY oder GOOGLE_CX_ID nicht in .env gesetzt. Simuliere Google-Suche.');
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

        if (countryCode) {
            searchParams.gl = countryCode;
        }
        
        if (language) {
            searchParams.lr = language;
        }
        if (sortByDate) {
            searchParams.sort = 'date';
        }

        console.log(`[GoogleSearch] Führe Suche durch für: "${finalQuery}" mit Parametern:`, searchParams);
        const response = await axios.get(GOOGLE_SEARCH_API_URL, { params: searchParams });

        if (response.data && response.data.items) {
            const results = response.data.items.map(item => ({ title: item.title, link: item.link }));
            await logActivity({
                actionType: 'GOOGLE_SEARCH_SUCCESS',
                status: 'success',
                details: { ...logDetails, resultsFound: results.length, urls: results.map(r => r.link) },
                username: 'System'
            });
            return results;
        } else {
            await logActivity({
                actionType: 'GOOGLE_SEARCH_NO_RESULTS',
                status: 'success',
                details: logDetails,
                username: 'System'
            });
            return [];
        }
    } catch (error) {
        const errorMessage = error.response ? error.response.data.error.message : error.message;
        console.error('Fehler bei der Google-Suche:', errorMessage);
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
