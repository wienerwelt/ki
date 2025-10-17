// backend/services/jobManagerService.js
const { aiContentQueue, scrapeQueue, emailQueue, dataUpdatesQueue } = require('./queueService');
const { triggerNewsSearchForAll } = require('./accountIntelligenceService');
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

function findQueueForJob(job) {
    // Hinzugefügte Prüfung: Ignoriere Jobs ohne gültige ID
    if (!job || typeof job.id !== 'string') {
        console.warn(`[JobManager] Ein fehlerhafter Job ohne gültige ID in Redis gefunden, wird ignoriert:`, job);
        return null; // Wichtig: null zurückgeben, um den Fehler zu signalisieren
    }
    if (job.id.startsWith('scrape:')) return scrapeQueue;
    if (job.id.startsWith('email:')) return emailQueue;
    // Alle anderen (sub:, sys-sub:, system:) gehören zur aiContentQueue
    return aiContentQueue;
}

// ========================================================================
// == Zentrale Synchronisation
// ========================================================================
async function synchronizeSchedulesFromDB() {
    console.log('[JobManager] Starting full synchronization of DB schedules with Redis queue...');
    const client = await db.connect();
    try {
        // Schritt 1: Hole alle Jobs aus der DB und aus Redis
        const [
            repeatableJobs,
            userSubs,
            systemSubs,
            scrapingRules,
            // KORREKTUR 1: Lese das Feld 'recipient_group', um die Jobs unterscheiden zu können
            cronJobsFromDb 
        ] = await Promise.all([
            Promise.all([
                aiContentQueue.getRepeatableJobs(),
                scrapeQueue.getRepeatableJobs(),
                emailQueue.getRepeatableJobs(),
                dataUpdatesQueue.getRepeatableJobs(), // Auch hier die Jobs abrufen
            ]).then(results => results.flat()),
            client.query("SELECT id, schedule FROM user_ai_content_subscriptions WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE").then(res => res.rows),
            client.query("SELECT id, schedule FROM system_ai_content_subscriptions WHERE schedule IS NOT NULL AND is_active = TRUE").then(res => res.rows),
            client.query("SELECT id, schedule FROM scraping_rules WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE").then(res => res.rows),
            // Lese jetzt alle relevanten Felder aus der cronjobs Tabelle
            client.query("SELECT id, name, schedule, recipient_group FROM cronjobs WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE").then(res => res.rows)
        ]);

        // Schritt 2: Erstelle eine Liste aller Job-IDs, die in der DB aktiv sind
        const activeDbJobIds = new Set([
            ...userSubs.map(j => `sub:${j.id}`),
            ...systemSubs.map(j => `sys-sub:${j.id}`),
            ...scrapingRules.map(j => `scrape:${j.id}`),
            // KORREKTUR 2: Verwende eine generische Job-ID für cronjobs
            ...cronJobsFromDb.map(j => `cronjob:${j.id}`) 
        ]);

        let removedCount = 0;
        let addedCount = 0;

        // Schritt 3: Entferne veraltete Jobs aus Redis
        for (const job of repeatableJobs) {
            if (!job || !job.id || !activeDbJobIds.has(job.id)) {
                // Finde die richtige Queue, um den Job zu entfernen
                const queue = findQueueForJob(job) || (job.id?.startsWith('cronjob:') ? (cronJobsFromDb.find(dbJob => `cronjob:${dbJob.id}` === job.id)?.recipient_group === 'data-update' ? dataUpdatesQueue : emailQueue) : null);
                if (queue) {
                    await queue.removeRepeatableByKey(job.key);
                    console.log(`[JobManager] Removed obsolete job '${job.id}' from queue.`);
                    removedCount++;
                }
            }
        }
        
        // Schritt 4: Füge neue/fehlende Jobs zur richtigen Queue hinzu
        const scheduledRedisIds = new Set(repeatableJobs.map(j => j.id).filter(Boolean));

        // User-, System- und Scraping-Jobs hinzufügen (unverändert)
        const allOtherDbJobs = [
            ...userSubs.map(j => ({ type: 'userSub', ...j })),
            ...systemSubs.map(j => ({ type: 'systemSub', ...j })),
            ...scrapingRules.map(j => ({ type: 'scrapeRule', ...j })),
        ];
        
        for (const job of allOtherDbJobs) {
            let jobId;
            switch(job.type) {
                case 'userSub':    jobId = `sub:${job.id}`; break;
                case 'systemSub':  jobId = `sys-sub:${job.id}`; break;
                case 'scrapeRule': jobId = `scrape:${job.id}`; break;
            }

            if (!scheduledRedisIds.has(jobId)) {
                addedCount++;
                switch(job.type) {
                    case 'userSub':    await setSubscriptionSchedule(job.id, job.schedule); break;
                    case 'systemSub':  await setSystemSubscriptionSchedule(job.id, job.schedule); break;
                    case 'scrapeRule': await setScrapingSchedule(job.id, job.schedule); break;
                }
            }
        }

        // KORREKTUR 3: Iteriere separat über die cronjobs und weise sie der korrekten Queue zu
        for (const job of cronJobsFromDb) {
            const jobId = `cronjob:${job.id}`;
            if (!scheduledRedisIds.has(jobId)) {
                addedCount++;
                const jobData = { cronJobId: job.id };
                const jobOptions = {
                    jobId,
                    repeat: { cron: job.schedule, tz: 'Europe/Vienna' },
                };

                if (job.recipient_group === 'data-update') {
                    // Zum Data-Update-Worker
                    await dataUpdatesQueue.add(job.name, jobData, jobOptions);
                    console.log(`[JobManager] Scheduled data-update job '${job.name}' (${jobId}) with '${job.schedule}'.`);
                } else {
                    // Zum E-Mail-Worker
                    await emailQueue.add(job.name, jobData, jobOptions);
                    console.log(`[JobManager] Scheduled email job '${job.name}' (${jobId}) with '${job.schedule}'.`);
                }
            }
        }

        console.log(`[JobManager] Synchronization complete. Removed ${removedCount} obsolete jobs, added ${addedCount} new jobs.`);
    } catch (error) {
        console.error('[JobManager] Critical error during schedule synchronization:', error);
    } finally {
        client.release();
    }
}


async function setupAccountIntelligenceJob() {
  const jobName = 'account-intelligence-search';
  const jobId = `system:${jobName}`;
  const cronPattern = '0 */4 * * *'; // Alle 4 Stunden

  // Entfernt einen eventuell alten Job mit gleicher ID, um das Pattern zu aktualisieren
  const repeatableJobs = await scrapeQueue.getRepeatableJobs();
  const existingJob = repeatableJobs.find(job => job.id === jobId);
  if (existingJob) {
    await scrapeQueue.removeRepeatableByKey(existingJob.key);
  }

  // Fügt den neuen, wiederkehrenden Job hinzu
  await scrapeQueue.add(jobName, {}, {
    jobId,
    repeat: { cron: cronPattern, tz: 'Europe/Vienna' },
  });
  console.log(`[JobManager] Scheduled system job '${jobName}' with pattern '${cronPattern}'.`);
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
  // NEUER EXPORT:
  setupAccountIntelligenceJob,
};
