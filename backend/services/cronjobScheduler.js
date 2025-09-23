// backend/services/cronjobScheduler.js
const cronParser = require('cron-parser');
const db = require('../config/db');
const { processSubscription } = require('./intelligentContentService');
const { triggerSingleRuleScrape } = require('./scraperService');
const { triggerEmailJob } = require('../controllers/adminCronjobsController');
const { dataUpdatesQueue } = require('../services/queueService');
const { processSavedSearchNotifications } = require('./notificationService');

/**
 * Checks all relevant tables for jobs that are due and executes them.
 */
const runScheduledJobs = async () => {
    const now = new Date();
    console.log(`[CRON] Checking for scheduled jobs at ${now.toISOString()}`);

    const client = await db.connect();
    try {
        // 1. Execute scheduled AI Subscriptions
        const aiSubs = await client.query("SELECT * FROM user_ai_content_subscriptions WHERE is_active = TRUE AND schedule IS NOT NULL AND schedule <> ''");
        for (const sub of aiSubs.rows) {
            if (isDue(sub.schedule, now)) {
                console.log(`[CRON] Executing AI Subscription Job for user ${sub.user_id}`);
                processSubscription(sub).catch(err => console.error(`[CRON] Error in background AI job ${sub.id}:`, err.message));
            }
        }

        // 2. Execute scheduled Scraping Rules
        const scrapingRules = await client.query("SELECT * FROM scraping_rules WHERE is_active = TRUE AND schedule IS NOT NULL AND schedule <> ''");
        for (const rule of scrapingRules.rows) {
            if (isDue(rule.schedule, now)) {
                console.log(`[CRON] Executing Scraping Job for rule ${rule.id} (${rule.name})`);
                triggerSingleRuleScrape(rule.id).catch(err => console.error(`[CRON] Error in background scraping job ${rule.id}:`, err.message));
            }
        }

        // 3. Execute scheduled Email Jobs
        // PASST DIE QUERY AN, UM DATA-UPDATE-JOBS AUSZUSCHLIESSEN
        const emailJobs = await client.query("SELECT * FROM cronjobs WHERE recipient_group <> 'data-update' AND is_active = TRUE AND schedule IS NOT NULL AND schedule <> ''");
        for (const job of emailJobs.rows) {
            if (isDue(job.schedule, now)) {
                console.log(`[CRON] Enqueueing Email Job: ${job.name} (ID: ${job.id})`);
                // KORREKTUR: Job direkt zur emailQueue hinzufügen
                emailQueue.add(job.name, { emailJobId: job.id })
                    .catch(err => console.error(`[CRON] Error enqueueing email job ${job.id}:`, err.message));
                // last_run_at aktualisieren, wie bei den anderen Jobs auch
                client.query('UPDATE cronjobs SET last_run_at = NOW() WHERE id = $1', [job.id]);
            }
        }
        
        // 4. Execute scheduled Data Update Jobs (NEUER ABSCHNITT)
        // FRAGT DIESELBE TABELLE AB, ABER NUR NACH DEM NEUEN TYP
        const dataJobs = await client.query("SELECT * FROM cronjobs WHERE recipient_group = 'data-update' AND is_active = TRUE AND schedule IS NOT NULL AND schedule <> ''");
        for (const job of dataJobs.rows) {
            if (isDue(job.schedule, now)) {
                console.log(`[CRON] Enqueueing Data Update Job: ${job.name}`);
                // Job zur neuen 'data-updates'-Queue hinzufügen
                dataUpdatesQueue.add(job.name, { jobId: job.id });
                client.query('UPDATE cronjobs SET last_run_at = NOW() WHERE id = $1', [job.id]);
            }
        }

        // 5. Execute Saved Search Notifications (NEUER ABSCHNITT)
        // Dieser Job wird fest einmal pro Tag ausgeführt, kann aber auch in die cronjobs-Tabelle verschoben werden.
        const fundingNotificationSchedule = '0 3 * * *'; // Jeden Tag um 03:00 Uhr
        if (isDue(fundingNotificationSchedule, now)) {
            console.log(`[CRON] Enqueueing Saved Search Notification Job`);
            // Wir rufen die Logik direkt auf, da sie nicht in einer Queue laufen muss.
            // Alternativ könnte man sie auch in die emailQueue einreihen.
            processSavedSearchNotifications().catch(err => console.error(`[CRON] Error in Saved Search Notification job:`, err.message));
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
        if (interval.hasPrev()) {
            const prevRun = interval.prev().toDate();
            const diff = now.getTime() - prevRun.getTime();
            return (diff >= 0 && diff < 60000); // Within the last minute
        }
    } catch (err) {
        console.error(`[CRON] Invalid cron expression "${schedule}":`, err.message);
        return false;
    }
    return false;
}

module.exports = {
    runScheduledJobs,
};