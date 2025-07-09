// backend/services/genericScraperService.js
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { logActivity } = require('./auditLogService');

/**
 * Scrapt den reinen Artikeltext von einer URL mit Mozilla's Readability.
 * @param {string} url - Die zu scrapende URL.
 * @returns {Promise<string>} - Der extrahierte und bereinigte Artikeltext.
 */
const scrapeUrlText = async (url) => {
    await logActivity({
        actionType: 'SCRAPING_URL_START',
        status: 'info',
        details: { url },
        username: 'System'
    });

    try {
        // VORAB-PRÜFUNG: Handelt es sich um eine HTML-Seite?
        const headResponse = await axios.head(url, { timeout: 5000 });
        const contentType = headResponse.headers['content-type'];
        if (!contentType || !contentType.includes('text/html')) {
            throw new Error(`Inhaltstyp ist nicht HTML (${contentType}), wird übersprungen.`);
        }

        console.log(`[GenericScraper] Starte Scraping von HTML-Seite: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });

        // NEU: JSDOM wird so konfiguriert, dass es keine externen Ressourcen wie CSS lädt.
        // Das verhindert CSS-Parsing-Fehler und macht den Prozess schneller.
        const dom = new JSDOM(response.data, {
            url: url
        });

        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (article && article.textContent) {
            const cleanedText = article.textContent.replace(/\s\s+/g, ' ').trim();
            
            console.log(`[GenericScraper] Erfolgreich Text von ${url} extrahiert. Länge: ${cleanedText.length} Zeichen.`);
            
            await logActivity({
                actionType: 'SCRAPING_URL_SUCCESS',
                status: 'success',
                details: { url, textLength: cleanedText.length, title: article.title },
                username: 'System'
            });
            
            return cleanedText;
        } else {
            throw new Error('Readability konnte keinen Artikelinhalt finden.');
        }

    } catch (error) {
        const errorMessage = error.message;
        console.error(`[GenericScraper] Fehler beim Scrapen von ${url}:`, errorMessage);

        await logActivity({
            actionType: 'SCRAPING_URL_FAILURE',
            status: 'failure',
            details: { url, error: errorMessage },
            username: 'System'
        });
        
        return '';
    }
};

module.exports = {
    scrapeUrlText
};
