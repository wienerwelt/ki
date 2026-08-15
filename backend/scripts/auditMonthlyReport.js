const db = require('../config/db');

async function run() {
    const [jobs, recipients, rules, readColumns, eventCategories] = await Promise.all([
        db.query(`
            SELECT id, name, recipient_group, schedule, is_active, last_run_at
            FROM cronjobs
            WHERE name IN ('monthly-report', 'daily-briefing')
            ORDER BY name
        `),
        db.query(`
            SELECT
                bp.id AS business_partner_id,
                bp.name AS business_partner_name,
                COUNT(u.id) FILTER (
                    WHERE u.role IN ('assistenz', 'admin')
                      AND u.is_active = TRUE
                      AND NULLIF(BTRIM(u.email), '') IS NOT NULL
                )::integer AS active_admin_assistants,
                COUNT(u.id) FILTER (
                    WHERE u.role IN ('assistenz', 'admin')
                      AND u.newsletter_opt_in = TRUE
                      AND u.is_active = TRUE
                      AND NULLIF(BTRIM(u.email), '') IS NOT NULL
                )::integer AS eligible_recipients
            FROM business_partners bp
            LEFT JOIN users u
              ON u.business_partner_id = bp.id
            WHERE bp.is_active = TRUE
              AND COALESCE(bp.allow_automated_newsletter, FALSE) = TRUE
            GROUP BY bp.id, bp.name
            ORDER BY bp.name
        `),
        db.query(`
            SELECT id, name, source_identifier, url_pattern, category_default, schedule, is_active
            FROM scraping_rules
            WHERE url_pattern ILIKE '%fuhrparknews.at/termine/feed%'
            ORDER BY name
        `),
        db.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'user_read_scraped_content'
              AND column_name IN ('read_at', 'created_at')
            ORDER BY column_name
        `),
        db.query(`
            SELECT id, name, category_type
            FROM categories
            WHERE name ILIKE '%event%' OR name ILIKE '%termin%'
            ORDER BY name
        `),
    ]);

    console.log(JSON.stringify({
        monthlyReportReady: jobs.rows.some((job) => job.name === 'monthly-report' && job.is_active && job.schedule),
        readTimestampColumns: readColumns.rows.map((row) => row.column_name),
        jobs: jobs.rows,
        eligibleRecipientsByPartner: recipients.rows,
        fuhrparknewsEventFeedRules: rules.rows,
        eventCategories: eventCategories.rows,
    }, null, 2));
}

run()
    .catch((error) => {
        console.error('[audit:monthly-report] fehlgeschlagen:', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
