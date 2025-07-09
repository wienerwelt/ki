// backend/services/scrapingService.js
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const xml2js = require('xml2js');
const { logActivity } = require('./auditLogService');

/**
 * Interne Funktion zum Scrapen von generischem HTML-Inhalt mit Mozilla's Readability.
 * @param {string} htmlContent - Der HTML-Inhalt der Seite.
 * @param {string} url - Die Original-URL für die korrekte Link-Auflösung.
 * @returns {Promise<string>} - Der extrahierte und bereinigte Artikeltext.
 */
async function _scrapeHtml(htmlContent, url) {
    try {
        const dom = new JSDOM(htmlContent, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        
        if (article && article.textContent) {
            return article.textContent.replace(/\s\s+/g, ' ').trim();
        }
        throw new Error('Readability konnte keinen lesbaren Artikelinhalt finden.');
    } catch (error) {
        throw new Error(`Fehler bei der HTML-Verarbeitung mit Readability: ${error.message}`);
    }
}

/**
 * Interne Funktion zum Parsen von XML/RSS-Feeds.
 * @param {string} xmlContent - Der XML-Inhalt des Feeds.
 * @returns {Promise<object>} - Das geparste JavaScript-Objekt.
 */
async function _parseXml(xmlContent) {
    try {
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const result = await parser.parseStringPromise(xmlContent);
        // Gibt die geparsten Daten zurück. Die aufrufende Funktion muss die Struktur kennen.
        return result;
    } catch (error) {
        throw new Error(`Fehler beim Parsen des XML/RSS-Feeds: ${error.message}`);
    }
}


/**
 * Intelligenter Haupt-Scraper, der den Inhaltstyp erkennt und die passende Methode wählt.
 * Diese Funktion ist der einzige Export des Moduls.
 * @param {string} url - Die zu scrapende URL.
 * @returns {Promise<{type: 'html'|'xml', data: string|object}|null>} - Ein Objekt mit dem Inhaltstyp und den Daten, oder null bei einem Fehler.
 */
async function scrapeUrl(url) {
    await logActivity({ actionType: 'SCRAPING_URL_START', status: 'info', details: { url }, username: 'System' });

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 15000
        });

        const contentType = response.headers['content-type'] || '';
        let result = null;

        if (contentType.includes('html')) {
            console.log(`[Scraper] Erkenne HTML für ${url}. Verarbeite mit Readability.`);
            const textContent = await _scrapeHtml(response.data, url);
            result = { type: 'html', data: textContent };
        } else if (contentType.includes('xml') || contentType.includes('rss')) {
            console.log(`[Scraper] Erkenne XML/RSS für ${url}. Verarbeite mit xml2js.`);
            const parsedObject = await _parseXml(response.data);
            result = { type: 'xml', data: parsedObject };
        } else {
            throw new Error(`Nicht unterstützter Inhaltstyp: ${contentType}`);
        }

        if (!result || !result.data) {
             throw new Error('Konnte keinen Inhalt extrahieren.');
        }

        await logActivity({ actionType: 'SCRAPING_URL_SUCCESS', status: 'success', details: { url, contentType }, username: 'System' });
        return result;

    } catch (error) {
        console.error(`[Scraper] Fehler beim Scrapen von ${url}:`, error.message);
        await logActivity({ actionType: 'SCRAPING_URL_FAILURE', status: 'failure', details: { url, error: error.message }, username: 'System' });
        return null; // Gibt null zurück, damit der aufrufende Service darauf reagieren kann.
    }
}

module.exports = {
    scrapeUrl
};
