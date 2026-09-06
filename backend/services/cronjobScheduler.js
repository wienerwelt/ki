// backend/services/cronjobScheduler.js
const cronParser = require('cron-parser');
const db = require('../config/db');
const { checkSystemHealthAndAlert } = require('./reportingService');
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
                
                // --- UPDATE START: Account Intelligence und Data Updates ---
                if (job.recipient_group === 'data-update') {
                    
                    // Mapping: Der Job heißt in der DB "Account Intelligence Search",
                    // aber der Worker erwartet "trigger-account-intelligence".
                    let jobName = job.name;
                    if (job.name === 'Account Intelligence Search') {
                        jobName = 'trigger-account-intelligence';
                    }

                    console.log(`[CRON] Enqueueing Data Update Job: ${jobName}`);
                    dataUpdatesQueue.add(jobName, { jobId: job.id });
                } 
                // --- UPDATE ENDE ---

                else if (job.recipient_group === 'scraping') {
                    console.log(`[CRON] Enqueueing Scraping Trigger Job: ${job.name}`);
                    scrapeQueue.add(job.name, { cronJobId: job.id })
                        .catch(err => console.error(`[CRON] Error enqueueing account intelligence job ${job.id}:`, err.message));
                }
                else { // Alle anderen gehen an die emailQueue
                    console.log(`[CRON] Enqueueing Email/Notification Job: ${job.name} (ID: ${job.id})`);
                    const minuteKey = now.toISOString().slice(0, 16).replace(/[^0-9]/g, '');
                    await emailQueue.add(job.name, { emailJobId: job.id }, {
                        jobId: `cron-${job.id}-${minuteKey}`,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 30000 },
                        removeOnComplete: 500,
                        removeOnFail: 1000,
                    });
                }
                
                // [FIX] Update timestamp for ALL job types
                await client.query('UPDATE cronjobs SET last_run_at = NOW() WHERE id = $1', [job.id]);                
            }
        }

        // 4. System Health Check & Alerting (Non-blocking)
        // Prüft, ob DB, Redis oder Worker down sind. 
        // Falls ja: Verschickt EINE Mail. Falls recovered: Verschickt EINE Entwarnung.
        checkSystemHealthAndAlert().catch(err => {
            console.error('[CRON] Fehler beim Ausführen des System Health Checks:', err.message);
        });

        // Technische Integrationsprotokolle dienen der Fehlersuche, nicht der
        // dauerhaften Profilbildung. Ein täglicher Lauf hält die Tabelle klein.
        if (now.getUTCHours() === 2 && now.getUTCMinutes() === 23) {
            const cleanup = await client.query(
                "DELETE FROM account_radar_api_sync_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '180 days'"
            );
            if (cleanup.rowCount > 0) {
                console.log(`[CRON] ${cleanup.rowCount} alte Account-Radar-API-Protokolle entfernt.`);
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
