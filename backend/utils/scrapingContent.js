// A feed can be served as application/xhtml+xml (e.g. Stellantis).
// Inspect the actual XML root before falling back to the HTTP content type.
function isXmlFeedContent(rawContent, contentType = '') {
    const head = String(rawContent || '').replace(/^\uFEFF/, '').trimStart().slice(0, 8192)
        .replace(/^(?:<\?[^?]*\?>\s*|<!--[\s\S]*?-->\s*)+/, '');
    if (/^<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(head)) return true;
    if (/^<(?:html(?:\s|>)|!doctype\s+html)/i.test(head)) return false;
    const type = String(contentType).toLowerCase();
    return !type.includes('html') && /xml|rss|atom/.test(type);
}

function scrapingFetchError(error) {
    const status = error.response?.status;
    let message;
    if (status === 401 || status === 403) {
        message = `Die Quelle verweigert den automatischen Abruf (HTTP ${status}). Bitte eine öffentlich zugängliche Feed-URL bzw. eine Freigabe beim Anbieter prüfen. HTML-Selektoren lösen diese Zugriffssperre nicht.`;
    } else if (status === 429) {
        message = 'Die Quelle begrenzt Abrufe (HTTP 429). Bitte später erneut testen und einen längeren Scraping-Abstand wählen.';
    } else if (status) {
        message = `Die Quelle konnte nicht abgerufen werden (HTTP ${status}). Bitte die Feed-URL prüfen.`;
    } else if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
        message = 'Die Quelle antwortet nicht rechtzeitig. Bitte später erneut testen.';
    } else {
        message = 'Die Quelle konnte nicht erreicht werden. Bitte URL und Netzwerkverbindung prüfen.';
    }
    const result = new Error(message);
    result.statusCode = 502;
    return result;
}

function feedText(value) {
    if (typeof value === 'string') return value;
    return typeof value?._ === 'string' ? value._ : null;
}

function webUrl(value, base) {
    if (!value) return null;
    try {
        const url = new URL(value, base);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
}

function feedLink(item) {
    const links = Array.isArray(item.link) ? item.link : [item.link];
    const alternate = links.find((link) => link?.$?.href && (!link.$.rel || link.$.rel === 'alternate'));
    const value = alternate?.$?.href || links.map((link) => feedText(link) || link?.href).find(Boolean);
    const guid = item.guid?.$?.isPermaLink === 'false' ? null : feedText(item.guid);
    return webUrl(value || guid);
}

function previewSkipReason(item, rule) {
    if (!item.original_url) return 'Keine gültige Artikel-URL';
    const publishedDate = item.published_date ? new Date(item.published_date) : null;
    if (rule.scrape_after_date && publishedDate) {
        const cutoff = new Date(rule.scrape_after_date);
        cutoff.setUTCHours(0, 0, 0, 0);
        if (publishedDate < cutoff) return `Vor Stichtag ${rule.scrape_after_date}`;
    }
    const category = String(rule.category_default || '').toLowerCase();
    if ((['event', 'events'].includes(category) || category.endsWith('_events')) && !publishedDate) {
        return 'Veranstaltung ohne gültiges Datum';
    }
    return null;
}

module.exports = { isXmlFeedContent, scrapingFetchError, feedText, feedLink, previewSkipReason, webUrl };
