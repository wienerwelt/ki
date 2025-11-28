// backend/services/cronjobScheduler.js
const cronParser = require('cron-parser');
const db = require('../config/db');
// Importiere alle notwendigen Queues
const { aiContentQueue, scrapeQueue, emailQueue, dataUpdatesQueue } = require('./queueService');

/**
 * Checks all relevant tables for jobs that are due and adds them to the appropriate queue.
 */
const runScheduledJobs = async () => {
    const now = new Date();
    console.log(`[CRON] Checking for scheduled jobs at ${now.toISOString()}`);

    const client = await db.connect();
    try {
        // 1. Enqueue scheduled AI Subscriptions for the aiWorker
        const aiSubs = await client.query("SELECT * FROM user_ai_content_subscriptions WHERE is_active = TRUE AND schedule IS NOT NULL AND schedule <> ''");
        for (const sub of aiSubs.rows) {
            if (isDue(sub.schedule, now)) {
                console.log(`[CRON] Enqueueing AI Subscription Job for user ${sub.user_id}`);
                aiContentQueue.add('subscription-processing', { subscription: sub })
                    .catch(err => console.error(`[CRON] Error enqueueing AI job ${sub.id}:`, err.message));
            }
        }

        // 2. Enqueue scheduled Scraping Rules for the scrapeWorker
        const scrapingRules = await client.query("SELECT * FROM scraping_rules WHERE is_active = TRUE AND schedule IS NOT NULL AND schedule <> ''");
        for (const rule of scrapingRules.rows) {
            if (isDue(rule.schedule, now)) {
                console.log(`[CRON] Enqueueing Scraping Job for rule ${rule.id} (${rule.name})`);
                scrapeQueue.add(rule.name, { ruleId: rule.id })
                    .catch(err => console.error(`[CRON] Error enqueueing scraping job ${rule.id}:`, err.message));
            }
        }

        // 3. Enqueue scheduled Generic & Email Jobs (inkl. Saved Search Notifications)
        const genericJobs = await client.query("SELECT * FROM cronjobs WHERE is_active = TRUE AND schedule IS NOT NULL AND schedule <> ''");
        for (const job of genericJobs.rows) {
            if (isDue(job.schedule, now)) {
                // Je nach Gruppe in die richtige Queue einreihen
                if (job.recipient_group === 'data-update') {
                    console.log(`[CRON] Enqueueing Data Update Job: ${job.name}`);
                    dataUpdatesQueue.add(job.name, { jobId: job.id });
                } 
                else if (job.recipient_group === 'scraping') {
                    console.log(`[CRON] Enqueueing Scraping Trigger Job: ${job.name}`);
                    scrapeQueue.add('trigger-account-intelligence', { cronJobId: job.id })
                        .catch(err => console.error(`[CRON] Error enqueueing account intelligence job ${job.id}:`, err.message));
                }
                else { // Alle anderen gehen an die emailQueue
                    console.log(`[CRON] Enqueueing Email/Notification Job: ${job.name} (ID: ${job.id})`);
                    emailQueue.add(job.name, { emailJobId: job.id })
                        .catch(err => console.error(`[CRON] Error enqueueing email job ${job.id}:`, err.message));
                }
                
                // [FIX] Update timestamp for ALL job types, not just emails
                await client.query('UPDATE cronjobs SET last_run_at = NOW() WHERE id = $1', [job.id]);                
            }
        }

    } catch (error) {
        console.error('[CRON] Error during scheduled job execution:', error);
    } finally {
        client.release();
    }
};

/**
 * Helper function to check if a cron schedule was due in the last minute.
 */
function isDue(schedule, now) {
    try {
        const interval = cronParser.parseExpression(schedule, { currentDate: now, tz: 'Europe/Vienna' });
        const prevRun = interval.prev().toDate();
        const diff = now.getTime() - prevRun.getTime();
        return (diff >= 0 && diff < 60000); // Innerhalb der letzten Minute
    } catch (err) {
        console.error(`[CRON] Invalid cron expression "${schedule}":`, err.message);
        return false;
    }
}

module.exports = {
    runScheduledJobs,
};