// backend/services/jobManagerService.js
const db = require('../config/db');
const cronParser = require('cron-parser');

// Hinweis: Wir importieren die Queues nicht mehr, da wir hier keine Jobs mehr schedulen.
// Das Scheduling übernimmt jetzt der cronjobScheduler.js via Datenbank-Polling.

/**
 * HELPER: Berechnet die nächste Ausführungszeit für die Anzeige im Frontend.
 * (Reine Anzeigelogik, schreibt nichts in Redis/DB)
 */
function calculateNextRun(schedule, idForLogging) {
  let next_run_at = null;
  if (schedule) {
    try {
      const options = { currentDate: new Date(), tz: 'Europe/Vienna' };
      const interval = cronParser.parseExpression(schedule, options);
      next_run_at = interval.next().toISOString();
    } catch (err) {
      // Fehler loggen, aber nicht crashen
      // console.warn(`[JobManager] Info: Kein gültiger Cron-String für ID ${idForLogging}: "${schedule}"`);
    }
  }
  return next_run_at;
}

// ========================================================================
// == EMAIL JOB SCHEDULING
// ========================================================================
async function setEmailJobSchedule(emailJobId, cronPattern) {
  // PASSIV: Wir machen hier nichts mehr.
  // Der Controller hat die DB bereits geupdatet.
  // Der cronjobScheduler.js liest die DB alle 60 Sekunden aus.
  console.log(`[JobManager] Email Job ${emailJobId} wurde in DB aktualisiert (Polling übernimmt).`);
}

async function removeEmailJobSchedule(emailJobId) {
  // PASSIV: Nichts zu tun, da keine Repeatables in Redis liegen sollten.
}

async function getEmailJobs() {
  // Lese direkt aus der DB für das Frontend
  const { rows } = await db.query(
    "SELECT * FROM cronjobs WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE"
  );
  return rows.map(job => ({ ...job, next_run_at: calculateNextRun(job.schedule, job.id) }));
}


// ========================================================================
// == USER-SUBSCRIPTIONS
// ========================================================================
async function setSubscriptionSchedule(subscriptionId, cronPattern) {
  console.log(`[JobManager] User Sub ${subscriptionId} wurde in DB aktualisiert (Polling übernimmt).`);
}

async function removeSubscriptionSchedule(subscriptionId) {
  // Passiv
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
// == SYSTEM-SUBSCRIPTIONS
// ========================================================================
async function setSystemSubscriptionSchedule(subscriptionId, cronPattern) {
  console.log(`[JobManager] System Sub ${subscriptionId} wurde in DB aktualisiert (Polling übernimmt).`);
}

async function removeSystemSubscriptionSchedule(subscriptionId) {
  // Passiv
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
// == SCRAPING-RULES
// ========================================================================
async function setScrapingSchedule(ruleId, cronPattern) {
  console.log(`[JobManager] Scraping Rule ${ruleId} wurde in DB aktualisiert (Polling übernimmt).`);
}

async function removeScrapingSchedule(ruleId) {
  // Passiv
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
// == ZENTRALE SYNCHRONISATION (Veraltet / Deaktiviert)
// ========================================================================
async function synchronizeSchedulesFromDB() {
    // WICHTIG: Diese Funktion macht jetzt absichtlich NICHTS mehr.
    // Würden wir hier weitermachen, würden wir wieder Redis-Jobs anlegen,
    // die dann doppelt laufen (Redis + DB-Poller).
    console.log('[JobManager] Sync aufgerufen -> Ignoriert, da DB-Polling aktiv ist.');
}

async function setupAccountIntelligenceJob() {
  // Auch hier: Wir wollen keine versteckten Redis-Jobs mehr.
  // Wenn dieser Job laufen soll, muss er in der 'cronjobs' Tabelle der DB stehen.
  // Falls er dort fehlt, sollte er einmalig per SQL-Seed eingefügt werden.
  console.log('[JobManager] setupAccountIntelligenceJob -> Ignoriert (bitte via DB steuern).');
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
  setupAccountIntelligenceJob,
};