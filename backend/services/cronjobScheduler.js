// backend/services/cronjobScheduler.js
const cronParser = require('cron-parser');
const db = require('../config/db');
const { processSubscription } = require('./intelligentContentService');
const { triggerSingleRuleScrape } = require('./scraperService');
// const emailService = require('./emailService'); // Annahme: Es gibt einen E-Mail-Service

/**
 * Checks all database tables for jobs that are due to run in the current minute
 * and executes them.
 */
const runScheduledJobs = async () => {
    const now = new Date();
    console.log(`Checking for scheduled jobs at ${now.toISOString()}`);

    const client = await db.connect();
    try {
        // 1. Execute scheduled AI Subscriptions
        const aiSubs = await client.query("SELECT * FROM content_subscriptions WHERE is_active = TRUE AND schedule IS NOT NULL");
        for (const sub of aiSubs.rows) {
            try {
                const interval = cronParser.parseExpression(sub.schedule, { currentDate: now, tz: 'Europe/Vienna' });
                // Check if the job was due in the last minute
                if (interval.hasPrev()) {
                     const prevRun = interval.prev().toDate();
                     const diff = now.getTime() - prevRun.getTime();
                     if (diff >= 0 && diff < 60000) { // Within the last minute
                        console.log(`Executing AI Subscription Job for user ${sub.user_id} with rule ${sub.ai_prompt_rule_id}`);
                        // Execute the job in the background without awaiting the result
                        processSubscription(sub).catch(err => console.error(`Error in background AI job ${sub.id}:`, err.message));
                     }
                }
            } catch (err) {
                console.error(`Invalid cron expression for AI subscription ${sub.id}: ${sub.schedule}`, err.message);
            }
        }

        // 2. Execute scheduled Scraping Rules
        const scrapingRules = await client.query("SELECT * FROM scraping_rules WHERE is_active = TRUE AND schedule IS NOT NULL");
         for (const rule of scrapingRules.rows) {
            try {
                const interval = cronParser.parseExpression(rule.schedule, { currentDate: now, tz: 'Europe/Vienna' });
                 if (interval.hasPrev()) {
                     const prevRun = interval.prev().toDate();
                     const diff = now.getTime() - prevRun.getTime();
                      if (diff >= 0 && diff < 60000) {
                        console.log(`Executing Scraping Job for rule ${rule.id} (${rule.name})`);
                        // Execute the job in the background
                        triggerSingleRuleScrape(rule.id).catch(err => console.error(`Error in background scraping job ${rule.id}:`, err.message));
                      }
                 }
            } catch (err) {
                console.error(`Invalid cron expression for scraping rule ${rule.id}: ${rule.schedule}`, err.message);
            }
        }

        // 3. Execute scheduled Email Jobs (once implemented)
        // const emailJobs = await client.query("SELECT * FROM email_cronjobs WHERE is_active = TRUE AND schedule IS NOT NULL");
        // for (const job of emailJobs.rows) { ... }

    } catch (error) {
        console.error('Error during scheduled job execution:', error);
    } finally {
        client.release();
    }
};

module.exports = {
    runScheduledJobs,
};
