// backend/workers/dataUpdateWorker.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
process.title = 'dataUpdateWorker';
const workerName = 'dataUpdateWorker'; 

const { Worker } = require('bullmq');
const db = require('../config/db'); // <--- NEU: DB Import hinzugefügt
const { connection: redisClient, heartbeatRedisClient } = require('../services/queueService');
const { updateDailyIndicators, updateMonthlyIndicators } = require('../services/updateCommodityPrices');

// NEU: generateSentimentQuestionForPartner hinzugefügt
const { generateBriefingsForAllPartners, generateSentimentQuestionForPartner } = require('../services/marketBriefingService');

console.log(`[${workerName}] Worker-Prozess startet...`);

const worker = new Worker('data-updates', async (job) => {
    console.log(`[${workerName}] Verarbeite Job: ${job.name} (ID: ${job.id})`);

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

            // --- NEUER BLOCK START ---
            case 'update-sentiment-question':
                console.log(`[${workerName}] Starte Update des Sentiment-Barometers für alle Partner...`);
                const client = await db.connect();
                try {
                    // 1. Alle aktiven Business Partner holen
                    const partnersRes = await client.query("SELECT id, name FROM business_partners WHERE is_active = TRUE");
                    const partners = partnersRes.rows;

                    console.log(`[${workerName}] Generiere Sentiment-Fragen für ${partners.length} Partner...`);

                    for (const partner of partners) {
                        try {
                            // A. Sicherstellen, dass die Basis-Umfrage für diesen Partner existiert
                            let surveyId;
                            const surveyRes = await client.query(
                                "SELECT id FROM surveys WHERE business_partner_id = $1 AND title = 'Markt-Barometer' LIMIT 1",
                                [partner.id]
                            );

                            if (surveyRes.rows.length === 0) {
                                // Erstelle Umfrage für diesen Partner, falls nicht vorhanden
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

                            // B. KI-Frage für diesen Partner generieren
                            // (Holt das Briefing dieses Partners und erstellt daraus die Frage)
                            const questionText = await generateSentimentQuestionForPartner(partner.id);

                            // C. Duplikat-Check (für diesen Partner)
                            const checkRes = await client.query(
                                "SELECT id FROM survey_questions WHERE survey_id = $1 AND question_text = $2",
                                [surveyId, questionText]
                            );

                            if (checkRes.rows.length === 0) {
                                // D. Speichern
                                const order = Math.floor(Date.now() / 1000);
                                await client.query(
                                    "INSERT INTO survey_questions (survey_id, question_text, question_type, display_order) VALUES ($1, $2, 'sentiment', $3)",
                                    [surveyId, questionText, order]
                                );
                                console.log(`[${workerName}] Frage für Partner '${partner.name}' erstellt: ${questionText}`);
                            } else {
                                console.log(`[${workerName}] Frage für Partner '${partner.name}' existiert bereits.`);
                            }

                        } catch (partnerErr) {
                            console.error(`[${workerName}] Fehler bei Partner ${partner.name}:`, partnerErr.message);
                            // Wir machen weiter mit dem nächsten Partner, damit ein Fehler nicht alle stoppt
                        }
                    }
                } finally {
                    client.release();
                }
                break;
            // --- NEUER BLOCK ENDE ---

            default:
                throw new Error(`Unbekannter Job-Name in der data-updates Queue: ${job.name}`);
        }
    } catch (err) {
        console.error(`[${workerName}] Fehler bei Job ${job.id} (${job.name}):`, err.stack || err.message || err);
        throw err;
    }
}, { connection: redisClient });

worker.on('completed', (job) => console.log(`[${workerName}] completed ${job.id} (${job.name})`));
worker.on('failed', (job, err) => console.error(`[${workerName}] failed ${job?.id} (${job?.name}):`, err?.message));

console.log(`[${workerName}] Worker läuft und wartet auf Jobs in der "data-updates"-Queue...`);

setInterval(() => {
  // Der Heartbeat nutzt jetzt die zentrale, importierte Verbindung
  heartbeatRedisClient.set(`worker_heartbeat:${workerName}`, new Date().toISOString(), 'EX', 60)
    .catch(err => {
      console.error(`[${workerName}-Heartbeat] FEHLER: Konnte Heartbeat nicht an Redis senden:`, err.message);
    });
}, 15000);

console.log(`[${workerName}] Heartbeat-Monitoring gestartet.`);