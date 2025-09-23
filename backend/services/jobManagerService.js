// backend/services/jobManagerService.js
const { aiContentQueue, scrapeQueue, emailQueue } = require('./queueService'); // ⬅️ zentral
const db = require('../config/db');
const cronParser = require('cron-parser');

// ========================================================================
// == EMAIL JOB SCHEDULING
// ========================================================================
async function setEmailJobSchedule(emailJobId, cronPattern) {
  const jobId = `email:${emailJobId}`;
  await removeEmailJobSchedule(emailJobId);
  if (cronPattern) {
    const { rows } = await db.query(
      'SELECT * FROM cronjobs WHERE id = $1 AND is_active = TRUE',
      [emailJobId]
    );
    if (rows.length === 0) throw new Error('Email job not found or inactive');
    
    // NEU: Den Namen aus dem Datenbankergebnis extrahieren
    const jobDetails = rows[0];
    const jobName = jobDetails.name || 'Geplanter E-Mail-Job'; // Fallback

    // Den Namen als Job-Namen verwenden
    await emailQueue.add(jobName, { emailJobId }, {
      jobId,
      repeat: { cron: cronPattern, tz: 'Europe/Vienna' },
    });
    console.log(`[JobManager] Scheduled email job '${jobName}' (${jobId}) with '${cronPattern}'.`);
  }
}

async function removeEmailJobSchedule(emailJobId) {
  const jobId = `email:${emailJobId}`;
  const r = await emailQueue.getRepeatableJobs();
  const toRemove = r.find(j => j.id === jobId);
  if (toRemove) {
    await emailQueue.removeRepeatableByKey(toRemove.key);
    console.log(`[JobManager] Removed scheduled email job '${jobId}'.`);
  }
}

async function getEmailJobs() {
  const { rows } = await db.query(
    "SELECT * FROM cronjobs WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
  );
  return rows.map(job => ({ ...job, next_run_at: calculateNextRun(job.schedule, job.id) }));
}

// ========================================================================
// == HELPER: nächste Ausführungszeit sicher berechnen
// ========================================================================
function calculateNextRun(schedule, idForLogging) {
  let next_run_at = null;
  if (schedule) {
    try {
      const options = { currentDate: new Date(), tz: 'Europe/Vienna' };
      const interval = cronParser.parseExpression(schedule, options);
      next_run_at = interval.next().toISOString();
    } catch (err) {
      console.error(`[JobManager] UNGÜLTIGER CRON-STRING für ID ${idForLogging}: "${schedule}". Fehler: ${err.message}`);
    }
  }
  return next_run_at;
}

// ========================================================================
// == USER-SUBSCRIPTIONS (user_ai_content_subscriptions) → ai-content-generation
// ========================================================================
async function setSubscriptionSchedule(subscriptionId, cronPattern) {
  const jobId = `sub:${subscriptionId}`;
  await removeSubscriptionSchedule(subscriptionId);

  if (cronPattern) {
    const subscriptionRes = await db.query('SELECT * FROM user_ai_content_subscriptions WHERE id = $1', [subscriptionId]);
    if (subscriptionRes.rows.length === 0) throw new Error('User subscription not found');

    const subscription = subscriptionRes.rows[0];
    await aiContentQueue.add('subscription-processing', { subscription }, {
      jobId,
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
    const { rows } = await db.query(`
      SELECT 
        cs.id, cs.is_active, cs.schedule, u.id as user_id, u.email as user_email, 
        bp.name as business_partner_name, apr.id as prompt_rule_id, apr.name as prompt_rule_name, 
        cs.keywords, cs.region, cs.created_at
      FROM user_ai_content_subscriptions cs
      JOIN users u ON cs.user_id = u.id
      JOIN ai_prompt_rules apr ON cs.ai_prompt_rule_id = apr.id
      LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
      WHERE cs.schedule IS NOT NULL AND cs.schedule <> ''
    `);
    return rows.map(sub => ({ ...sub, next_run_at: calculateNextRun(sub.schedule, sub.id) }));
  } catch (error) {
    console.error('[JobManager] Error fetching user subscriptions:', error);
    throw error;
  }
}

// ========================================================================
// == SYSTEM-SUBSCRIPTIONS (system_ai_content_subscriptions) → ai-content-generation
// ========================================================================
async function setSystemSubscriptionSchedule(subscriptionId, cronPattern) {
  const jobId = `sys-sub:${subscriptionId}`;
  await removeSystemSubscriptionSchedule(subscriptionId);

  if (cronPattern) {
    const subRes = await db.query('SELECT * FROM system_ai_content_subscriptions WHERE id = $1', [subscriptionId]);
    if (subRes.rows.length === 0) throw new Error('System subscription not found');

    await aiContentQueue.add('system-job-processing', { systemSubscription: subRes.rows[0] }, {
      jobId,
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

async function getSystemSubscriptions() {
  try {
    const { rows } = await db.query(`
      SELECT sys.*, rules.name as prompt_rule_name 
      FROM system_ai_content_subscriptions sys
      JOIN ai_prompt_rules rules ON sys.ai_prompt_rule_id = rules.id
      WHERE sys.schedule IS NOT NULL AND sys.schedule <> ''
    `);
    return rows.map(sub => ({ ...sub, next_run_at: calculateNextRun(sub.schedule, sub.id) }));
  } catch (err) {
    console.error('Error fetching system subscriptions:', err.message);
    throw err;
  }
}

// ========================================================================
// == SCRAPING-RULES (scraping_rules) → scrape-content-generation
// ========================================================================
async function setScrapingSchedule(ruleId, cronPattern) {
  const jobId = `scrape:${ruleId}`;
  await removeScrapingSchedule(ruleId);

  if (cronPattern) {
    const ruleRes = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [ruleId]);
    if (ruleRes.rows.length === 0) throw new Error('Scraping rule not found');

    await scrapeQueue.add('run-rule', { ruleId }, {
      jobId,
      repeat: { cron: cronPattern, tz: 'Europe/Vienna' },
    });
    console.log(`[JobManager] Scheduled scraping job '${jobId}' with pattern '${cronPattern}'.`);
  }
}

async function removeScrapingSchedule(ruleId) {
  const jobId = `scrape:${ruleId}`;
  const repeatableJobs = await scrapeQueue.getRepeatableJobs();
  const jobToRemove = repeatableJobs.find(job => job.id === jobId);
  if (jobToRemove) {
    await scrapeQueue.removeRepeatableByKey(jobToRemove.key);
    console.log(`[JobManager] Removed scheduled scraping job '${jobId}'.`);
  }
}

async function getScheduledScrapingRules() {
  try {
    const { rows } = await db.query(`
      SELECT id, name, source_identifier, region, schedule, last_scraped_at 
      FROM scraping_rules 
      WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE
    `);
    return rows.map(rule => ({ ...rule, next_run_at: calculateNextRun(rule.schedule, rule.id) }));
  } catch (err) {
    console.error('Fehler beim Laden der geplanten Scraping-Regeln:', err.message);
    throw err;
  }
}

// ========================================================================
// == Zentrale Synchronisation
// ========================================================================
async function synchronizeSchedulesFromDB() {
  console.log('[JobManager] Starting synchronization of all DB schedules with Redis queue...');
  const client = await db.connect();
  try {
    const [aiRepeat, scrapeRepeat, emailRepeat] = await Promise.all([
      aiContentQueue.getRepeatableJobs(),
      scrapeQueue.getRepeatableJobs(),
      emailQueue.getRepeatableJobs(),
    ]);
    const scheduledAiIds     = new Set(aiRepeat.map(j => j.id));
    const scheduledScrapeIds = new Set(scrapeRepeat.map(j => j.id));
    const scheduledEmailIds  = new Set(emailRepeat.map(j => j.id));

    let addedCount = 0;

    // 1) User-Subscriptions → AI-Queue
    const { rows: userSubs } = await client.query(
      "SELECT id, schedule FROM user_ai_content_subscriptions WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
    );
    for (const sub of userSubs) {
      const jobId = `sub:${sub.id}`;
      if (!scheduledAiIds.has(jobId)) {
        await setSubscriptionSchedule(sub.id, sub.schedule);
        addedCount++;
      }
    }

    // 2) System-Subscriptions → AI-Queue
    const { rows: systemSubs } = await client.query(
      "SELECT id, schedule FROM system_ai_content_subscriptions WHERE schedule IS NOT NULL AND is_active = TRUE"
    );
    for (const sub of systemSubs) {
      const jobId = `sys-sub:${sub.id}`;
      if (!scheduledAiIds.has(jobId)) {
        await setSystemSubscriptionSchedule(sub.id, sub.schedule);
        addedCount++;
      }
    }

    // 3) Scraping-Regeln → SCRAPE-Queue
    const { rows: scrapingRules } = await client.query(
      "SELECT id, schedule FROM scraping_rules WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
    );
    for (const rule of scrapingRules) {
      const jobId = `scrape:${rule.id}`;
      if (!scheduledScrapeIds.has(jobId)) {
        await setScrapingSchedule(rule.id, rule.schedule);
        addedCount++;
      }
    }

    // 4) Generische System-Jobs → AI-Queue
    const { rows: systemJobs } = await client.query(
      "SELECT job_name, schedule FROM system_jobs WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
    );
    for (const job of systemJobs) {
      const jobId = `system:${job.job_name}`;
      if (!scheduledAiIds.has(jobId)) {
        await aiContentQueue.add(job.job_name, { jobDetails: job }, {
          jobId,
          repeat: { cron: job.schedule, tz: 'Europe/Vienna' },
        });
        console.log(`[JobManager] Scheduled system job '${jobId}' with pattern '${job.schedule}'.`);
        addedCount++;
      }
    }

    // 5) Email-Cronjobs → EMAIL-Queue
    const { rows: emailRows } = await client.query(
      "SELECT id, schedule FROM cronjobs WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
    );
    for (const ej of emailRows) {
      const id = `email:${ej.id}`;
      if (!scheduledEmailIds.has(id)) {
        await setEmailJobSchedule(ej.id, ej.schedule);
        addedCount++;
      }
    }

    console.log(`[JobManager] Synchronization complete. Added/verified ${addedCount} missing scheduled jobs.`);
  } catch (error) {
    console.error('[JobManager] Critical error during schedule synchronization:', error);
  } finally {
    client.release();
  }
}

// ========================================================================
// == Exports
// ========================================================================
module.exports = {
  // User
  setSubscriptionSchedule,
  removeSubscriptionSchedule,
  getScheduledSubscriptions,
  // System
  setSystemSubscriptionSchedule,
  removeSystemSubscriptionSchedule,
  getSystemSubscriptions,
  // Scraping
  setScrapingSchedule,
  removeScrapingSchedule,
  getScheduledScrapingRules,
  // Email
  setEmailJobSchedule,
  removeEmailJobSchedule,
  getEmailJobs,
  // Sync
  synchronizeSchedulesFromDB,
};
