// backend/controllers/adminCronjobsController.js
const db = require('../config/db');
const cronParser = require('cron-parser');
const { aiContentQueue, emailQueue } = require('../services/queueService');
const jobManager = require('../services/jobManagerService');
const { generateAndSendDailyReport } = require('../services/reportingService');
const { dataUpdatesQueue } = require('../services/queueService');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// --- AI Subscription Functions ---
exports.getScheduledAISubscriptions = async (req, res) => {
  try {
    const jobs = await jobManager.getScheduledSubscriptions();
    res.json(jobs);
  } catch (err) {
    console.error('Fehler beim Laden der geplanten KI-Jobs:', err.message);
    res.status(500).send('Server error');
  }
};

exports.updateAISubscription = async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

  const { region, keywords, schedule, is_active } = req.body;
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Update PostgreSQL Database
    const updateFields = [];
    const values = [];
    let queryIndex = 1;

    if (region !== undefined) { updateFields.push(`region = $${queryIndex++}`); values.push(region); }
    if (keywords !== undefined) { updateFields.push(`keywords = $${queryIndex++}`); values.push(keywords); }
    if (schedule !== undefined) { updateFields.push(`schedule = $${queryIndex++}`); values.push(schedule); }
    if (typeof is_active === 'boolean') { updateFields.push(`is_active = $${queryIndex++}`); values.push(is_active); }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update provided.' });
    }

    values.push(id);
    const query = `UPDATE user_ai_content_subscriptions SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${queryIndex} RETURNING *`;
    const { rows } = await client.query(query, values);
    if (rows.length === 0) throw new Error('Abonnement nicht gefunden.');

    // 2. Update Redis Schedule if it was changed
    if (schedule !== undefined) {
      await jobManager.setSubscriptionSchedule(id, schedule);
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error updating AI subscription ${id}:`, err.message);
    res.status(500).send('Server error');
  } finally {
    client.release();
  }
};

exports.getScheduledScrapingRules = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, name, source_identifier, region, schedule, last_scraped_at, rule_type 
      FROM scraping_rules 
      WHERE schedule IS NOT NULL AND schedule <> '' AND is_active = TRUE
      ORDER BY name ASC
    `);

    // Berechne für jede Regel die nächste Ausführungszeit
    const rulesWithNextRun = rows.map(rule => {
      let next_run_at = null;
      try {
        if (rule.schedule) {
          const interval = cronParser.parseExpression(rule.schedule, { 
            currentDate: new Date(),
            tz: 'Europe/Vienna' 
          });
          next_run_at = interval.next().toISOString();
        }
      } catch (e) { 
        console.error(`Ungültiger Cron-String für Regel ${rule.id}: ${rule.schedule}`);
      }
      return { ...rule, next_run_at };
    });

    res.json(rulesWithNextRun);
  } catch (err) {
    console.error('Fehler beim Laden der geplanten Scraping-Regeln:', err.message);
    res.status(500).send('Server error');
  }
};

exports.triggerAISubscription = async (req, res) => {
  const { id } = req.params;
  try {
    const subRes = await db.query('SELECT * FROM user_ai_content_subscriptions WHERE id = $1', [id]);
    if (subRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement nicht gefunden.' });
    
    await aiContentQueue.add('subscription-processing', { subscription: subRes.rows[0] });
    res.status(202).json({ message: 'KI-Job wurde manuell zur Warteschlange hinzugefügt.' });
  } catch (err) {
    console.error('Error triggering AI subscription:', err.message);
    res.status(500).send('Server error');
  }
};

exports.deleteAISubscriptions = async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Keine IDs zum Löschen angegeben.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const id of ids) {
      await jobManager.removeSubscriptionSchedule(id);
      await client.query('DELETE FROM user_ai_content_subscriptions WHERE id = $1', [id]);
    }
    await client.query('COMMIT');
    res.status(200).json({ message: `${ids.length} Abonnement(s) erfolgreich gelöscht.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting AI subscriptions:', err.message);
    res.status(500).send('Server error');
  } finally {
    client.release();
  }
};

exports.getAIJobHistory = async (req, res) => {
  const { subscriptionId } = req.params;
  try {
    const subRes = await db.query('SELECT ai_prompt_rule_id FROM user_ai_content_subscriptions WHERE id = $1', [subscriptionId]);
    if (subRes.rows.length === 0) return res.json([]);
    const ruleId = subRes.rows[0].ai_prompt_rule_id;
    const { rows } = await db.query('SELECT * FROM ai_jobs WHERE ai_prompt_rule_id = $1 ORDER BY started_at DESC LIMIT 50', [ruleId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching AI job history:', err.message);
    res.status(500).send('Server error');
  }
};

exports.getSystemSubscriptions = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        sys.id, 
        sys.keywords, 
        sys.region, 
        sys.schedule, 
        sys.is_active,
        rules.name as prompt_rule_name 
      FROM system_ai_content_subscriptions sys
      JOIN ai_prompt_rules rules ON sys.ai_prompt_rule_id = rules.id
      WHERE sys.schedule IS NOT NULL AND sys.schedule <> '' AND sys.is_active = TRUE
      ORDER BY rules.name ASC
    `);

    const jobsWithNextRun = rows.map(job => {
      let next_run_at = null;
      try {
        if (job.schedule) {
          const interval = cronParser.parseExpression(job.schedule, { 
            currentDate: new Date(),
            tz: 'Europe/Vienna' 
          });
          next_run_at = interval.next().toISOString();
        }
      } catch (e) { 
        console.error(`Ungültiger Cron-String für System-Job ${job.id}: ${job.schedule}`);
      }
      return { ...job, next_run_at };
    });

    res.json(jobsWithNextRun);
  } catch (err) {
    console.error('Fehler beim Laden der System-Jobs:', err.message);
    res.status(500).send('Server error');
  }
};

exports.createSystemSubscription = async (req, res) => {
  const { ai_prompt_rule_id, keywords, region, schedule, is_active } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO system_ai_content_subscriptions (ai_prompt_rule_id, keywords, region, schedule, is_active) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ai_prompt_rule_id, keywords, region, schedule, is_active]
    );
    const newSub = rows[0];
    // Den neuen Job auch in Redis planen
    await jobManager.setSystemSubscriptionSchedule(newSub.id, newSub.schedule);
    res.status(201).json(newSub);
  } catch (err) {
    console.error('Error creating system subscription:', err.message);
    res.status(500).send('Server error');
  }
};

exports.updateSystemSubscription = async (req, res) => {
  const { id } = req.params;
  const { ai_prompt_rule_id, keywords, region, schedule, is_active } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE system_ai_content_subscriptions SET 
       ai_prompt_rule_id = $1, keywords = $2, region = $3, schedule = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [ai_prompt_rule_id, keywords, region, schedule, is_active, id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'System subscription not found.' });
    
    const updatedSub = rows[0];
    // Den Zeitplan in Redis aktualisieren
    await jobManager.setSystemSubscriptionSchedule(updatedSub.id, updatedSub.schedule);
    res.json(updatedSub);
  } catch (err) {
    console.error('Error updating system subscription:', err.message);
    res.status(500).send('Server error');
  }
};

exports.deleteSystemSubscription = async (req, res) => {
  const { id } = req.params;
  try {
    // Zuerst den Job aus Redis entfernen
    await jobManager.removeSystemSubscriptionSchedule(id);
    // Dann aus der Datenbank löschen
    const result = await db.query('DELETE FROM system_ai_content_subscriptions WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'System subscription not found.' });
    res.status(200).json({ message: 'System subscription deleted successfully.' });
  } catch (err) {
    console.error('Error deleting system subscription:', err.message);
    res.status(500).send('Server error');
  }
};


exports.getAllDataUpdateJobs = async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM cronjobs WHERE recipient_group = 'data-update' ORDER BY name ASC");

    // Berechne für jeden Job die nächste Ausführungszeit
    const jobsWithNextRun = rows.map(job => {
      let next_run_at = null;
      try {
        if (job.schedule) {
          const interval = cronParser.parseExpression(job.schedule, { 
            currentDate: new Date(),
            tz: 'Europe/Vienna' 
          });
          next_run_at = interval.next().toISOString();
        }
      } catch (e) { 
        console.error(`Ungültiger Cron-String für Job ${job.id}: ${job.schedule}`);
      }
      // 'name' wird zu 'job_name' umbenannt, um konsistent mit der DB-Struktur zu sein
      return { ...job, job_name: job.name, next_run_at };
    });

    res.json(jobsWithNextRun);
  } catch (err) {
    console.error('Error fetching data update jobs:', err.message);
    res.status(500).send('Server error');
  }
};

// ERWEITERTE VERSION
exports.updateDataUpdateJob = async (req, res) => {
  const { id } = req.params;
  // 'description' und 'name' als bearbeitbare Felder hinzufügen
  const { name, description, schedule, is_active } = req.body; 
  try {
    const { rows } = await db.query(
      'UPDATE cronjobs SET name = $1, description = $2, schedule = $3, is_active = $4, updated_at = NOW() WHERE id = $5 AND recipient_group = \'data-update\' RETURNING *',
      [name, description, schedule, is_active, id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Data update job not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating data update job:', err.message);
    res.status(500).send('Server error');
  }
};

exports.triggerDataUpdateJob = async (req, res) => {
  const { job_name } = req.body;
  try {
    await dataUpdatesQueue.add(job_name, { triggeredManually: true });
    res.status(202).json({ message: `Job '${job_name}' was manually added to the queue.` });
  } catch (err) {
    console.error(`Error triggering data update job ${job_name}:`, err.message);
    res.status(500).send('Server error');
  }
};


// --- Email Cronjob Functions ---
exports.getAllEmailJobs = async (req, res) => {
  try {
    // PASST QUERY AN: Schließt 'data-update' Jobs aus
    const { rows } = await db.query("SELECT * FROM cronjobs WHERE recipient_group <> 'data-update' ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    console.error('Error fetching email jobs:', err.message);
    res.status(500).send('Server error');
  }
};

exports.createEmailJob = async (req, res) => {
  const { name, recipient_group, schedule, is_active } = req.body;
  if (!name || !recipient_group) {
    return res.status(400).json({ message: 'Name und Empfängergruppe sind erforderlich.' });
  }
  try {
    const { rows } = await db.query(
      'INSERT INTO cronjobs (name, recipient_group, schedule, is_active) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, recipient_group, schedule, is_active === undefined ? true : is_active]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating email job:', err.message);
    res.status(500).send('Server error');
  }
};

exports.updateEmailJob = async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
  const { name, recipient_group, schedule, is_active } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE cronjobs SET name = $1, recipient_group = $2, schedule = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [name, recipient_group, schedule, is_active, id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'E-Mail-Job nicht gefunden.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating email job:', err.message);
    res.status(500).send('Server error');
  }
};

exports.deleteEmailJob = async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
  try {
    const result = await db.query('DELETE FROM cronjobs WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'E-Mail-Job nicht gefunden.' });
    res.status(200).json({ message: 'E-Mail-Job erfolgreich gelöscht.' });
  } catch (err) {
    console.error('Error deleting email job:', err.message);
    res.status(500).send('Server error');
  }
};

async function enqueueEmailJobById(id) {
  if (!isValidUUID(id)) throw new Error('Invalid ID format.');
  
  // NEU: Den Namen des Jobs aus der Datenbank abrufen
  const jobDetailsRes = await db.query('SELECT name FROM cronjobs WHERE id = $1', [id]);
  if (jobDetailsRes.rows.length === 0) {
    throw new Error(`E-Mail-Job mit ID ${id} nicht in der Datenbank gefunden.`);
  }
  const jobName = jobDetailsRes.rows[0].name || 'Unbenannter E-Mail-Job'; // Fallback

  // Den abgerufenen Namen als Job-Namen verwenden
  await emailQueue.add(jobName, { emailJobId: id }, { jobId: `email:${id}:${Date.now()}` });
  return { ok: true };
}
exports.enqueueEmailJobById = enqueueEmailJobById;

exports.triggerEmailJob = async (req, res) => {
  const { id } = req.params;
  try {
    await enqueueEmailJobById(id);
    return res.status(202).json({ message: 'E-Mail-Job enqueued.' });
  } catch (err) {
    console.error('Error enqueueing email job:', err.message);
    return res.status(400).json({ message: err.message || 'Enqueue failed' });
  }
};
