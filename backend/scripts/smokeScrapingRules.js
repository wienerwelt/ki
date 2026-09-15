const assert = require('node:assert/strict');
const axios = require('axios');
const { isXmlFeedContent, feedLink, previewSkipReason } = require('../utils/scrapingContent');

const xml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Abarth</title>${Array.from({ length: 13 }, (_, i) => `<item><title>Beitrag ${i + 1}</title><link>https://example.invalid/press/${i + 1}</link><pubDate>Wed, 27 May 2026 15:15:08 +0200</pubDate><description>Testbeitrag</description></item>`).join('')}</channel></rss>`;
const rule = {
    id: '148a8fa4-7409-4d30-a6d4-09b519de4290', name: 'Test RSS',
    source_identifier: 'rss_smoke', url_pattern: 'https://example.invalid/rss',
    scraping_strategy: 'standard', rule_type: 'content', category_default: 'fleet_news',
    content_container_selector: null, title_selector: null, link_selector: null,
    date_format: null, use_headless_browser: false,
};
const insertedUrls = new Set();
let requests = [];
let response = { data: xml, headers: { 'content-type': 'application/xhtml+xml' } };
let fetchFailure = null;
let writeCount = 0;
let jobStatus = null;
const db = {
    query: async (sql, values = []) => {
        if (/^SELECT \* FROM scraping_rules/.test(sql)) return { rows: [rule] };
        if (/^SELECT id, name FROM tags/.test(sql)) return { rows: [] };
        if (/SELECT (?:id, name(?:, category_type)?) FROM categories/.test(sql)) {
            return { rows: [{ id: '164e0eb1-e6ba-456d-b923-42b4ddc442a9', name: 'fleet_news', category_type: 'content' }] };
        }
        if (/SELECT original_url FROM scraped_content/.test(sql)) {
            return { rows: values[0].filter(url => insertedUrls.has(url)).map(original_url => ({ original_url })) };
        }
        writeCount++;
        if (/INSERT INTO scraped_content \(/.test(sql)) {
            if (insertedUrls.has(values[1])) return { rows: [], rowCount: 0 };
            insertedUrls.add(values[1]);
            return { rows: [{ id: `test-${insertedUrls.size}` }], rowCount: 1 };
        }
        if (/UPDATE scraping_jobs SET status = 'completed'/.test(sql)) jobStatus = 'completed';
        if (/UPDATE scraping_jobs SET status = 'failed'/.test(sql)) jobStatus = 'failed';
        return { rows: [], rowCount: 1 };
    },
};

function stub(modulePath, exports) {
    require.cache[require.resolve(modulePath)] = { id: modulePath, filename: modulePath, loaded: true, exports };
}

stub('../config/db', db);
stub('../services/auditLogService', { logActivity: async () => {} });
stub('../services/queueService', { scrapeQueue: {}, fundingQueue: {} });
stub('../services/jobManagerService', {});
stub('../services/aiService', { callOpenAI: async () => { throw new Error('KI darf im RSS-Test nicht aufgerufen werden'); } });
stub('../services/googleSearchService', { searchGoogle: async () => { throw new Error('Keine externe Suche im Test'); } });
const originalGet = axios.get;
axios.get = async (url, options) => {
    requests.push({ url, options });
    if (fetchFailure) throw fetchFailure;
    return response;
};

async function controllerTest(body) {
    const controller = require('../controllers/adminScrapingRulesController');
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.data = data; return this; },
    };
    await controller.testScrapingRule({ body, params: {}, user: { id: 'test-admin' } }, res);
    return res;
}

async function run() {
    assert.equal(isXmlFeedContent(xml, 'application/xhtml+xml'), true);
    assert.equal(isXmlFeedContent(xml, 'text/html'), true);
    assert.equal(isXmlFeedContent('\uFEFF<!-- feed -->\n<rss version="2.0">', 'text/plain'), true);
    assert.equal(isXmlFeedContent('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml">', 'application/xhtml+xml'), false);
    assert.equal(feedLink({ link: [{ $: { href: 'https://example.invalid/feed', rel: 'self' } }, { $: { href: 'https://example.invalid/article', rel: 'alternate' } }] }), 'https://example.invalid/article');
    assert.equal(feedLink({ link: 'javascript:alert(1)' }), null);
    assert.equal(feedLink({ guid: { _: 'urn:abc', $: { isPermaLink: 'false' } } }), null);
    assert.equal(previewSkipReason({ original_url: 'https://example.invalid/a', published_date: '2026-05-27' }, { scrape_after_date: '2026-06-01' }), 'Vor Stichtag 2026-06-01');

    const { previewScrapingRule, triggerSingleRuleScrape } = require('../services/scraperService');
    const preview = await previewScrapingRule(rule);
    assert.equal(preview.kind, 'xml_feed');
    assert.equal(preview.feed_title, 'Abarth');
    assert.equal(preview.total_found, 13);
    assert.equal(preview.found, 10);
    assert.equal(preview.would_insert, 10);
    assert.equal(preview.items[0].published_date, '2026-05-27T13:15:08.000Z');
    assert.equal(writeCount, 0, 'Vorschau darf keine Inhalte, Jobs oder Regeln schreiben');
    const filtered = await previewScrapingRule({ ...rule, scrape_after_date: '2026-06-01' });
    assert.equal(filtered.would_insert, 0);
    assert.equal(filtered.skipped, 10);

    const apiPreview = await controllerTest(rule);
    assert.equal(apiPreview.statusCode, 200);
    assert.equal(apiPreview.data.ok, true);
    assert.equal(apiPreview.data.preview.total_found, 13);
    assert.equal(writeCount, 0);
    const invalid = await controllerTest({ ...rule, category_default: '' });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.data.ok, false);
    assert.match(invalid.data.message, /Kategorie/);

    const previewRequest = requests[0];
    requests = [];
    await triggerSingleRuleScrape(rule.id, 'test-job');
    assert.equal(jobStatus, 'completed');
    assert.equal(insertedUrls.size, 13, 'Worker muss RSS trotz XHTML-Inhaltstyp importieren');
    assert.deepEqual(requests[0], previewRequest, 'Test und Worker müssen dieselben HTTP-Einstellungen nutzen');
    assert.equal((await previewScrapingRule(rule)).already_existing, 10);
    await triggerSingleRuleScrape(rule.id, 'test-job-again');
    assert.equal(insertedUrls.size, 13, 'Erneuter Import darf keine Dubletten erzeugen');

    response = { data: '<html><body><article><a href="/a">Artikel</a></article></body></html>', headers: { 'content-type': 'text/html' } };
    const htmlMissing = await controllerTest(rule);
    assert.equal(htmlMissing.data.ok, false);
    assert.match(htmlMissing.data.message, /HTML statt.*RSS/);
    const noMatches = await previewScrapingRule({ ...rule, content_container_selector: '.missing', title_selector: 'a', link_selector: 'a' });
    assert.equal(noMatches.found, 0);
    assert.equal(noMatches.warnings.length, 1);
    const funding = await previewScrapingRule({ ...rule, rule_type: 'funding', content_container_selector: 'article', link_selector: 'a' });
    assert.equal(funding.would_insert, 1);
    response.data = '<html><body><article><a href="javascript:alert(1)">Nicht verlinken</a></article></body></html>';
    const unsafeLink = await previewScrapingRule({ ...rule, content_container_selector: 'article', title_selector: 'a', link_selector: 'a' });
    assert.equal(unsafeLink.skipped, 1);
    assert.equal(unsafeLink.items[0].original_url, null);

    fetchFailure = { response: { status: 403 } };
    const blocked = await controllerTest(rule);
    assert.equal(blocked.statusCode, 502);
    assert.match(blocked.data.message, /HTTP 403/);
    assert.equal(blocked.data.ok, false);
    fetchFailure = { response: { status: 429 } };
    await assert.rejects(previewScrapingRule(rule), /HTTP 429/);
    console.log(JSON.stringify({ ok: true, rssWithXhtmlContentType: true, samePreviewAndWorkerRequest: true, noPreviewWrites: true, workerImportsAndDeduplication: true, validationAndBlockedSourceErrors: true, cutoffAndSkipReasons: true, realDatabaseWrites: 0, externalRequests: 0 }));
}

run().catch(error => { console.error('[smoke:scraping-rules]', error); process.exitCode = 1; })
    .finally(() => { axios.get = originalGet; });
