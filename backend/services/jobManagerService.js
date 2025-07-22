// backend/services/jobManagerService.js
const { aiContentQueue } = require('./queueService');
const db = require('../config/db');
const cronParser = require('cron-parser');

// ========================================================================
// == Funktionen für Nutzer-Abonnements (content_subscriptions)
// ========================================================================

async function setSubscriptionSchedule(subscriptionId, cronPattern) {
    const jobId = `sub:${subscriptionId}`;
    await removeSubscriptionSchedule(subscriptionId);

    if (cronPattern) {
        const subscriptionRes = await db.query('SELECT * FROM content_subscriptions WHERE id = $1', [subscriptionId]);
        if (subscriptionRes.rows.length === 0) throw new Error('Subscription not found');
        
        const subscription = subscriptionRes.rows[0];
        await aiContentQueue.add('subscription-processing', { subscription }, {
            jobId: jobId,
            repeat: { cron: cronPattern, tz: 'Europe/Vienna' },
        });
        console.log(`[JobManager] Scheduled user job '${jobId}' with pattern '${cronPattern}'.`);
    }
}

async function removeSubscriptionSchedule(subscriptionId) {
    const jobId = `sub:${subscriptionId}`;
    const repeatableJobs = await aiContentQueue.getRepeatableJobs();
    const jobToRemove = repeatableJobs.find(job => job.id === jobId);

    if (jobToRemove) {
        await aiContentQueue.removeRepeatableByKey(jobToRemove.key);
        console.log(`[JobManager] Removed scheduled user job '${jobId}'.`);
    }
}

async function getScheduledSubscriptions() {
    try {
        const { rows: subsFromDB } = await db.query(`
            SELECT 
                cs.id, 
                cs.is_active, 
                cs.schedule,
                u.id as user_id,
                u.email as user_email, 
                bp.name as business_partner_name,
                apr.id as prompt_rule_id,
                apr.name as prompt_rule_name, 
                cs.keywords, 
                cs.region, 
                cs.created_at
            FROM content_subscriptions cs
            JOIN users u ON cs.user_id = u.id
            JOIN ai_prompt_rules apr ON cs.ai_prompt_rule_id = apr.id
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
            WHERE cs.schedule IS NOT NULL AND cs.schedule <> ''
        `);

        return subsFromDB.map(sub => {
            let next_run_at = null;
            try {
                if (sub.schedule) {
                    const interval = cronParser.parseExpression(sub.schedule, { currentDate: new Date(), tz: 'Europe/Vienna' });
                    next_run_at = interval.next().toISOString();
                }
            } catch (err) {
                console.error(`[JobManager] Invalid cron pattern for subscription ${sub.id}: ${sub.schedule}`);
            }
            return { ...sub, next_run_at };
        });
    } catch (error) {
        console.error('[JobManager] Error fetching user subscriptions from PostgreSQL:', error);
        throw error;
    }
}

// ========================================================================
// == Funktionen für System-Abonnements (ai_subscriptions)
// ========================================================================

async function setSystemSubscriptionSchedule(subscriptionId, cronPattern) {
    const jobId = `sys-sub:${subscriptionId}`;
    await removeSystemSubscriptionSchedule(subscriptionId);

    if (cronPattern) {
        const subRes = await db.query('SELECT * FROM ai_subscriptions WHERE id = $1', [subscriptionId]);
        if (subRes.rows.length === 0) throw new Error('System subscription not found');
        
        await aiContentQueue.add('system-job-processing', { systemSubscription: subRes.rows[0] }, {
            jobId: jobId,
            repeat: { cron: cronPattern, tz: 'Europe/Vienna' },
        });
        console.log(`[JobManager] Scheduled system job '${jobId}' with pattern '${cronPattern}'.`);
    }
}

async function removeSystemSubscriptionSchedule(subscriptionId) {
    const jobId = `sys-sub:${subscriptionId}`;
    const repeatableJobs = await aiContentQueue.getRepeatableJobs();
    const jobToRemove = repeatableJobs.find(job => job.id === jobId);
    if (jobToRemove) {
        await aiContentQueue.removeRepeatableByKey(jobToRemove.key);
        console.log(`[JobManager] Removed scheduled system job '${jobId}'.`);
    }
}

// ========================================================================
// == Funktionen für Scraping-Regeln (scraping_rules)
// ========================================================================

async function setScrapingSchedule(ruleId, cronPattern) {
    const jobId = `scrape:${ruleId}`;
    await removeScrapingSchedule(ruleId);

    if (cronPattern) {
        const ruleRes = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [ruleId]);
        if (ruleRes.rows.length === 0) throw new Error('Scraping rule not found');
        
        await aiContentQueue.add('scraping-rule-processing', { rule: ruleRes.rows[0] }, {
            jobId: jobId,
            repeat: { cron: cronPattern, tz: 'Europe/Vienna' },
        });
        console.log(`[JobManager] Scheduled scraping job '${jobId}' with pattern '${cronPattern}'.`);
    }
}

async function removeScrapingSchedule(ruleId) {
    const jobId = `scrape:${ruleId}`;
    const repeatableJobs = await aiContentQueue.getRepeatableJobs();
    const jobToRemove = repeatableJobs.find(job => job.id === jobId);
    if (jobToRemove) {
        await aiContentQueue.removeRepeatableByKey(jobToRemove.key);
        console.log(`[JobManager] Removed scheduled scraping job '${jobId}'.`);
    }
}

// ========================================================================
// == Zentrale Synchronisations-Funktion
// ========================================================================

async function synchronizeSchedulesFromDB() {
    console.log('[JobManager] Starting synchronization of all DB schedules with Redis queue...');
    const client = await db.connect();
    try {
        const repeatableJobs = await aiContentQueue.getRepeatableJobs();
        const scheduledJobIds = new Set(repeatableJobs.map(job => job.id));
        let addedCount = 0;

        // 1. Synchronisiere Nutzer-Abonnements
        const { rows: userSubs } = await client.query(
            "SELECT id, schedule FROM content_subscriptions WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
        );
        for (const sub of userSubs) {
            const jobId = `sub:${sub.id}`;
            if (!scheduledJobIds.has(jobId)) {
                console.log(`[JobManager] Found user subscription ${sub.id} in DB without a schedule in Redis. Adding it...`);
                await setSubscriptionSchedule(sub.id, sub.schedule);
                addedCount++;
            }
        }
        
        // 2. Synchronisiere System-Abonnements
        const { rows: systemSubs } = await client.query(
            "SELECT id, schedule FROM ai_subscriptions WHERE schedule IS NOT NULL AND is_active = TRUE"
        );
        for (const sub of systemSubs) {
            const jobId = `sys-sub:${sub.id}`;
            if (!scheduledJobIds.has(jobId)) {
                console.log(`[JobManager] Found system subscription ${sub.id} in DB without a schedule in Redis. Adding it...`);
                await setSystemSubscriptionSchedule(sub.id, sub.schedule);
                addedCount++;
            }
        }

        // 3. Synchronisiere Scraping-Regeln
        const { rows: scrapingRules } = await client.query(
            "SELECT id, schedule FROM scraping_rules WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
        );
        for (const rule of scrapingRules) {
            const jobId = `scrape:${rule.id}`;
            if (!scheduledJobIds.has(jobId)) {
                console.log(`[JobManager] Found scraping rule ${rule.id} in DB without a schedule in Redis. Adding it...`);
                await setScrapingSchedule(rule.id, rule.schedule);
                addedCount++;
            }
        }

        console.log(`[JobManager] Synchronization complete. Added/verified ${addedCount} missing scheduled jobs to the queue.`);

    } catch (error) {
        console.error('[JobManager] Critical error during schedule synchronization:', error);
    } finally {
        client.release();
    }
}

module.exports = {
    // Nutzer-Jobs
    setSubscriptionSchedule,
    removeSubscriptionSchedule,
    getScheduledSubscriptions,
    // System-Jobs
    setSystemSubscriptionSchedule,
    removeSystemSubscriptionSchedule,
    // Scraping-Jobs
    setScrapingSchedule,
    removeScrapingSchedule,
    // Synchronisation
    synchronizeSchedulesFromDB,
};
