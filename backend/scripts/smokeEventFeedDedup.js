const crypto = require('crypto');
const db = require('../config/db');
const { __test } = require('../services/scraperService');
const queueService = require('../services/queueService');

async function closeResources() {
    await Promise.allSettled([
        queueService.aiContentQueue.close(),
        queueService.scrapeQueue.close(),
        queueService.emailQueue.close(),
        queueService.dataUpdatesQueue.close(),
        queueService.fundingQueue.close(),
    ]);
    queueService.connection.disconnect();
    queueService.heartbeatRedisClient.disconnect();
    await db.end();
}

async function run() {
    const marker = crypto.randomUUID();
    const title = `Codex Dedupe Test ${marker}`;
    const firstUrl = `https://example.invalid/events/${marker}/a`;
    const secondUrl = `https://example.invalid/events/${marker}/b`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>Smoke Feed</title>
        <item><title>${title}</title><link>${firstUrl}</link><guid>${firstUrl}</guid><pubDate>Tue, 15 Sep 2026 08:00:00 +0200</pubDate><description><![CDATA[15.09.2026 - 10:00<br/>Messe Wien]]></description></item>
        <item><title>${title}</title><link>${secondUrl}</link><guid>${secondUrl}</guid><pubDate>Tue, 15 Sep 2026 08:00:00 +0200</pubDate><description><![CDATA[15.09.2026 - 10:00<br/>Messe Wien<br/>Messeplatz 1<br/>Wien]]></description></item>
        </channel></rss>`;

    try {
        const { rows: categories } = await db.query('SELECT id, name FROM categories');
        const inserted = await __test.processXmlFeedByRule(xml, {
            id: crypto.randomUUID(),
            name: 'Event feed smoke',
            source_identifier: `smoke_events_${marker}`,
            region: 'AT',
            date_format: null,
            category_default: 'fleet_events',
        }, null, [], categories);

        const { rows } = await db.query(`
            SELECT
                sc.id,
                sc.event_date,
                sc.summary,
                COUNT(scs.id)::integer AS source_count
            FROM scraped_content sc
            LEFT JOIN scraped_content_sources scs ON scs.scraped_content_id = sc.id
            WHERE sc.title = $1
            GROUP BY sc.id
        `, [title]);

        const result = rows[0];
        const ok = inserted === 1
            && rows.length === 1
            && result?.event_date
            && result?.source_count === 2
            && String(result?.summary || '').includes('Messeplatz 1');

        console.log(JSON.stringify({ ok, inserted, matches: rows.length, ...result }, null, 2));
        if (!ok) process.exitCode = 1;
    } finally {
        await db.query('DELETE FROM scraped_content WHERE title = $1', [title]);
    }
}

run()
    .catch((error) => {
        console.error('[smoke:event-feed-dedup] fehlgeschlagen:', error.message);
        process.exitCode = 1;
    })
    .finally(closeResources);
