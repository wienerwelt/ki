const db = require('../config/db');
const { triggerSingleRuleScrape } = require('../services/scraperService');
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
    const { rows: rules } = await db.query(`
        SELECT id
        FROM scraping_rules
        WHERE source_identifier = 'fuhrparknews_events' AND is_active = TRUE
        LIMIT 1
    `);
    if (!rules[0]) throw new Error('Aktive Fuhrparknews-RSS-Regel fehlt. Zuerst Migrationen ausführen.');

    const { rows: jobs } = await db.query(`
        INSERT INTO scraping_jobs (scraping_rule_id, status)
        VALUES ($1, 'pending')
        RETURNING id
    `, [rules[0].id]);

    await triggerSingleRuleScrape(rules[0].id, jobs[0].id);
    const { rows: completed } = await db.query(`
        SELECT status, completed_at
        FROM scraping_jobs
        WHERE id = $1
    `, [jobs[0].id]);
    const { rows: totals } = await db.query(`
        SELECT
            COUNT(DISTINCT scs.scraped_content_id)::integer AS canonical_events,
            COUNT(*)::integer AS source_records
        FROM scraped_content_sources scs
        WHERE scs.source_identifier = 'fuhrparknews_events'
    `);

    const result = { jobId: jobs[0].id, ...completed[0], ...totals[0] };
    console.log(JSON.stringify(result, null, 2));
    if (completed[0]?.status !== 'completed') process.exitCode = 1;
}

run()
    .catch((error) => {
        console.error('[sync:fuhrparknews-events] fehlgeschlagen:', error.message);
        process.exitCode = 1;
    })
    .finally(closeResources);
