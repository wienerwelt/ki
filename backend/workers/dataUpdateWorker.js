// backend/workers/dataUpdateWorker.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

process.title = 'dataUpdateWorker';
const workerName = 'dataUpdateWorker';

const { Worker } = require('bullmq');
const db = require('../config/db');
const {
  connection: redisClient,
  heartbeatRedisClient,
  connectRedisClients,
} = require('../services/queueService');

const { updateDailyIndicators, updateMonthlyIndicators } = require('../services/updateCommodityPrices');
const { generateBriefingsForAllPartners, generateSentimentQuestionForPartner } = require('../services/marketBriefingService');
const { triggerNewsSearchForAll } = require('../services/accountIntelligenceService');

function logWorkerBoot() {
  console.log('==================================================');
  console.log(`[data] ${workerName} startet...`);
  console.log('[data] NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('[data] DB_HOST:', process.env.DB_HOST || 'undefined');
  console.log('[data] DB_PORT:', process.env.DB_PORT || 'undefined');
  console.log('[data] DB_DATABASE:', process.env.DB_DATABASE || 'undefined');
  console.log('[data] REDIS_HOST:', process.env.REDIS_HOST || '127.0.0.1');
  console.log('[data] REDIS_PORT:', process.env.REDIS_PORT || '6379');
  console.log('[data] REDIS_URL gesetzt:', process.env.REDIS_URL ? 'ja' : 'nein');
  console.log('==================================================');
}

async function startWorker() {
  try {
    logWorkerBoot();

    console.log('[data] Prüfe Redis-Verbindungen...');
    await connectRedisClients();
    console.log('[data] Redis-Verbindungen sind bereit.');

    console.log('[data] Prüfe PostgreSQL-Verbindung...');
    const dbCheck = await db.query('SELECT current_database(), version()');
    console.log('[data] PostgreSQL verbunden.');
    console.log('[data] Aktive DB:', dbCheck.rows[0].current_database);
    console.log('[data] PostgreSQL Version:', dbCheck.rows[0].version);

    const worker = new Worker('data-updates', async (job) => {
      console.log(`[data] Verarbeite Job: ${job.name} (ID: ${job.id})`);

      try {
        switch (job.name) {
          case 'daily-market-briefing':
            await generateBriefingsForAllPartners();
            break;

          case 'daily-indicators':
            await updateDailyIndicators();
            break;

          case 'monthly-indicators':
            await updateMonthlyIndicators();
            break;

          case 'update-sentiment-question': {
            console.log('[data] Starte Update des Sentiment-Barometers für alle Partner...');
            const client = await db.connect();

            try {
              const partnersRes = await client.query(
                'SELECT id, name FROM business_partners WHERE is_active = TRUE'
              );
              const partners = partnersRes.rows;

              console.log(`[data] Generiere Sentiment-Fragen für ${partners.length} Partner...`);

              for (const partner of partners) {
                try {
                  let surveyId;

                  const surveyRes = await client.query(
                    "SELECT id FROM surveys WHERE business_partner_id = $1 AND title = 'Markt-Barometer' LIMIT 1",
                    [partner.id]
                  );

                  if (surveyRes.rows.length === 0) {
                    const newSurvey = await client.query(
                      `INSERT INTO surveys (title, description, is_active, is_public, display_location, business_partner_id)
                       VALUES ('Markt-Barometer', 'Wöchentliche Einschätzung', TRUE, TRUE, 'sentiment_widget', $1)
                       RETURNING id`,
                      [partner.id]
                    );
                    surveyId = newSurvey.rows[0].id;
                  } else {
                    surveyId = surveyRes.rows[0].id;
                  }

                  const questionText = await generateSentimentQuestionForPartner(partner.id);

                  const checkRes = await client.query(
                    'SELECT id FROM survey_questions WHERE survey_id = $1 AND question_text = $2',
                    [surveyId, questionText]
                  );

                  if (checkRes.rows.length === 0) {
                    const order = Math.floor(Date.now() / 1000);
                    await client.query(
                      "INSERT INTO survey_questions (survey_id, question_text, question_type, display_order) VALUES ($1, $2, 'sentiment', $3)",
                      [surveyId, questionText, order]
                    );
                    console.log(`[data] Frage für Partner '${partner.name}' erstellt: ${questionText}`);
                  } else {
                    console.log(`[data] Frage für Partner '${partner.name}' existiert bereits.`);
                  }

                } catch (partnerErr) {
                  console.error(`[data] Fehler bei Partner ${partner.name}:`, partnerErr.message);
                }
              }
            } finally {
              client.release();
            }
            break;
          }

          case 'trigger-account-intelligence':
            console.log('[data] Starte Account Intelligence Search (News-Suche)...');
            await triggerNewsSearchForAll();
            break;

          default:
            throw new Error(`Unbekannter Job-Name in der data-updates Queue: ${job.name}`);
        }

        console.log(`[data] Job "${job.name}" erfolgreich abgeschlossen.`);
      } catch (err) {
        console.error(`[data] Fehler bei Job ${job.id} (${job.name}):`, err?.stack || err?.message || err);
        throw err;
      }
    }, {
      connection: redisClient,
    });

    worker.on('ready', () => console.log('[data] Worker ready'));
    worker.on('active', (job) => console.log(`[data] active ${job.id} (${job.name})`));
    worker.on('completed', (job) => console.log(`[data] completed ${job.id} (${job.name})`));
    worker.on('failed', (job, err) => console.error(`[data] failed ${job?.id} (${job?.name}):`, err?.message));
    worker.on('error', (err) => console.error('[data] Worker error:', err.message));
    worker.on('closing', () => console.warn('[data] Worker closing'));
    worker.on('closed', () => console.warn('[data] Worker closed'));
    worker.on('stalled', (jobId) => console.warn(`[data] Job stalled: ${jobId}`));

    console.log('[data] Worker läuft und wartet auf Jobs in der "data-updates"-Queue...');
    console.log('[data] Heartbeat-Monitoring gestartet.');

    setInterval(async () => {
      try {
        const key = `worker_heartbeat:${workerName}`;
        const value = new Date().toISOString();
        await heartbeatRedisClient.set(key, value, 'EX', 60);
        console.log(`[data-heartbeat] OK -> ${key} = ${value}`);
      } catch (err) {
        console.error('[data-heartbeat] FEHLER:', err.message);
      }
    }, 15000);

  } catch (err) {
    console.error('[data] Kritischer Fehler beim Worker-Start:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[data] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[data] Uncaught Exception:', err);
});

startWorker();