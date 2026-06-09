// /var/www/vhosts/mobiliti.at/httpdocs/dashboard/backend/server.js

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

console.log("--- ENVIRONMENT CHECK ---");
console.log("DATABASE_URL:", process.env.DATABASE_URL);
console.log("DB_HOST:", process.env.DB_HOST);
console.log("-------------------------");

// --- 1. IMPORTE ---
const express = require('express');
const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const cron = require('node-cron');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const db = require('./config/db');
const auth = require('./middleware/authMiddleware');
const bullAuth = require('./middleware/bullAuth');
const jobManager = require('./services/jobManagerService');

// Scheduler
const { runScheduledJobs } = require('./services/cronjobScheduler');

const { dispatchAutomatedNewsletters } = require('./services/marketBriefingService');

// Bull Board & Queue
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const {
  connectRedisClients,
  aiContentQueue,
  scrapeQueue,
  emailQueue,
  dataUpdatesQueue,
  fundingQueue
} = require('./services/queueService');

// Routen
const authRoutes = require('./routes/authRoutes');
const publicRoutes = require('./routes/publicRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');
const dataRoutes = require('./routes/dataRoutes');
const businessPartnerRoutes = require('./routes/businessPartnerRoutes');
const widgetRoutes = require('./routes/widgetRoutes');
const adminBusinessPartnerRoutes = require('./routes/adminBusinessPartnerRoutes.js');
const adminWidgetTypeRoutes = require('./routes/adminWidgetTypeRoutes.js');
const adminBpWidgetAccessRoutes = require('./routes/adminBpWidgetAccessRoutes.js');
const adminBpAccountsRoutes = require('./routes/adminBpAccountsRoutes.js');
const adminBpCompetitorsRoutes = require('./routes/adminBpCompetitorsRoutes.js');
const adminUserRoutes = require('./routes/adminUserRoutes.js');
const adminScrapingRulesRoutes = require('./routes/adminScrapingRulesRoutes.js');
const adminScrapedContentRoutes = require('./routes/adminScrapedContentRoutes.js');
const adminAIPromptRulesRoutes = require('./routes/adminAIPromptRulesRoutes.js');
const adminAIContentRoutes = require('./routes/adminAIContentRoutes.js');
const adminCategoriesRoutes = require('./routes/adminCategoriesRoutes.js');
const adminAIExecutionRoutes = require('./routes/adminAIExecutionRoutes.js');
const adminTagsRoutes = require('./routes/adminTagsRoutes.js');
const adminSubscriptionsRoutes = require('./routes/adminSubscriptionsRoutes.js');
const adminRoleRoutes = require('./routes/adminRoleRoutes.js');
const adminMonitorRoutes = require('./routes/adminMonitorRoutes.js');
const adminStatsRoutes = require('./routes/adminStatsRoutes.js');
const adminAdvertisementsRoutes = require('./routes/adminAdvertisementsRoutes');
const adminBpActionsRoutes = require('./routes/adminBpActionsRoutes');
const adminCronjobsRoutes = require('./routes/adminCronjobsRoutes.js');
const sourcesRoutes = require('./routes/sourcesRoutes.js');
const adminSourcesRoutes = require('./routes/adminSourcesRoutes.js');
const feedbackRoutes = require('./routes/feedbackRoutes');
const fileRoutes = require('./routes/fileRoutes');
const dataController = require('./controllers/dataController');
const newsletterRoutes = require('./routes/newsletterRoutes');
const surveyRoutes = require('./routes/surveyRoutes');
const adminFundingRoutes = require('./routes/adminFundingRoutes');
const fundingRoutes = require('./routes/fundingRoutes');
const adminLegalMonitorRoutes = require('./routes/adminLegalMonitorRoutes');
const communityRoutes = require('./routes/communityRoutes');
const updateLastActive = require('./middleware/activityLogger');
const adminBriefingRoutes = require('./routes/adminBriefingEditorialRoutes');
const directoryRoutes = require('./routes/directoryRoutes');
const adminDirectoryRoutes = require('./routes/adminDirectoryRoutes');



// --- 2. HILFSFUNKTIONEN / BOOT-LOGS ---
function logBootConfig() {
  console.log('==================================================');
  console.log('[BOOT] Mobiliti Dashboard Backend startet...');
  console.log('[BOOT] NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('[BOOT] PORT:', PORT);
  console.log('[BOOT] DB_HOST:', process.env.DB_HOST || 'undefined');
  console.log('[BOOT] DB_PORT:', process.env.DB_PORT || 'undefined');
  console.log('[BOOT] DB_DATABASE:', process.env.DB_DATABASE || 'undefined');
  console.log('[BOOT] DATABASE_URL gesetzt:', process.env.DATABASE_URL ? 'ja' : 'nein');
  console.log('[BOOT] REDIS_HOST:', process.env.REDIS_HOST || 'undefined');
  console.log('[BOOT] REDIS_PORT:', process.env.REDIS_PORT || 'undefined');
  console.log('[BOOT] FRONTEND_URL:', process.env.FRONTEND_URL || 'undefined');
  console.log('==================================================');
}

function nowIso() {
  return new Date().toISOString();
}

// Globale Prozessfehler sichtbar machen
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Uncaught Exception:', err);
});

// Bull Board Adapter Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/jobs');

createBullBoard({
  queues: [
    new BullMQAdapter(aiContentQueue),
    new BullMQAdapter(scrapeQueue),
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(dataUpdatesQueue),
    new BullMQAdapter(fundingQueue),
  ],
  serverAdapter,
});

// --- 3. MIDDLEWARE ---
const allowedOrigins = [
  'http://localhost:5173', 
  'https://dashboard.mobiliti.at',
  'https://mobiliti.at',         // NEU: Hauptdomain erlauben
  'https://www.mobiliti.at'      // NEU: Hauptdomain (mit www) erlauben
];

app.use(cors({
  origin: function (origin, callback) {
    // Erlaubt Requests ohne Origin (z.B. Server-to-Server oder Postman) 
    // und Origins, die in unserer Liste stehen.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

app.use('/logos', express.static(path.join(__dirname, 'public', 'logos')));
app.use('/api/logos', express.static(path.join(__dirname, 'public', 'logos')));
app.use('/api/social-media', express.static(path.join(__dirname, 'public', 'social-media')));
app.use('/api/grafiken', express.static(path.join(__dirname, 'public', 'grafiken')));
app.use('/social-media', express.static(path.join(__dirname, 'public', 'social-media')));
app.use('/directory_logos', express.static(path.join(__dirname, 'public', 'directory_logos')));
app.use('/api/directory_logos', express.static(path.join(__dirname, 'public', 'directory_logos')));

// Request-Logging verbessert
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(
      `[REQ ${nowIso()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`
    );
  });

  next();
});

// --- 4. ROUTEN ---
app.use('/api/admin/jobs', bullAuth);
app.use('/api/admin/jobs', serverAdapter.getRouter());

app.use('/api/public', publicRoutes);

app.use('/api/auth', authRoutes);
app.use(updateLastActive);
app.use('/api/session', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.get('/api/data/active-advertisement', auth, dataController.getActiveAdvertisement);
app.use('/api/data', dataRoutes);
app.use('/api/business-partner', businessPartnerRoutes);
app.use('/api/widgets', widgetRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin/business-partners', adminBusinessPartnerRoutes);
app.use('/api/admin/widget-types', adminWidgetTypeRoutes);
app.use('/api/admin/bp-widget-access', adminBpWidgetAccessRoutes);
app.use('/api/admin/accounts', adminBpAccountsRoutes);
app.use('/api/admin/competitors', adminBpCompetitorsRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/scraped-content', adminScrapedContentRoutes);
app.use('/api/admin/scraping-rules', adminScrapingRulesRoutes);
app.use('/api/admin/ai-prompt-rules', adminAIPromptRulesRoutes);
app.use('/api/admin/ai-content', adminAIContentRoutes);
app.use('/api/admin/funding', adminFundingRoutes);
app.use('/api/admin/categories', adminCategoriesRoutes);
app.use('/api/admin/ai', adminAIExecutionRoutes);
app.use('/api/admin/tags', adminTagsRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionsRoutes);
app.use('/api/admin/roles', adminRoleRoutes);
app.use('/api/admin/monitor', adminMonitorRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
app.use('/api/admin/advertisements', adminAdvertisementsRoutes);
app.use('/api/admin/actions', adminBpActionsRoutes);
app.use('/api/admin/cronjobs', adminCronjobsRoutes);
app.use('/api/admin/sources', adminSourcesRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/funding', fundingRoutes);
app.use('/api/admin-legal-monitor', adminLegalMonitorRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admin/briefing', adminBriefingRoutes);
app.use('/api/onboarding', require('./routes/onboardingRoutes'));
app.use('/api/admin/social-media', require('./routes/adminSocialMediaRoutes'));
app.use('/api/admin/directory', adminDirectoryRoutes);
app.use('/api/directory', directoryRoutes);


// Debug-Routen
app.get('/api/debug/db-inspector', async (req, res) => {
  try {
    const dbNameResult = await db.query('SELECT current_database();');
    const currentDb = dbNameResult.rows[0].current_database;

    const tablesResult = await db.query(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
    );
    const tables = tablesResult.rows.map(row => row.tablename);

    res.status(200).json({
      message: 'Datenbank-Inspektor-Bericht',
      verbindung_hergestellt_zu_db: currentDb,
      gefundene_tabellen: tables
    });
  } catch (err) {
    console.error('[DEBUG] DB-Inspector Fehler:', err);
    res.status(500).json({ error: 'Fehler im DB-Inspektor', message: err.message });
  }
});

app.get('/api/debug/users', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users');
    res.status(200).json(rows);
  } catch (err) {
    console.error('[DEBUG] Users-Route Fehler:', err);
    res.status(500).json({ error: 'Fehler beim Abrufen der Daten' });
  }
});

// --- 5. FRONTEND & FEHLERBEHANDLUNG ---
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API Endpoint Not Found' });
});

const frontendDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[EXPRESS] UNHANDLED ERROR:', err);
  res.status(500).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    error: process.env.NODE_ENV === 'production' ? undefined : err
  });
});

// --- QUEUE CLEANUP ---
async function clearAllQueuesOnStartup() {
  console.log('[JobManager] Bereinige Queues beim Start...');

  const allQueues = [
    aiContentQueue,
    scrapeQueue,
    emailQueue,
    dataUpdatesQueue,
    fundingQueue,
  ];

  try {
    for (const queue of allQueues) {
      console.log(`[JobManager] Prüfe Queue: ${queue.name}`);

      const repeatableJobs = await queue.getRepeatableJobs();
      console.log(`[JobManager] ${queue.name}: ${repeatableJobs.length} repeatable Jobs gefunden`);

      for (const job of repeatableJobs) {
        await queue.removeRepeatableByKey(job.key);
        console.log(`[JobManager] Repeatable entfernt: ${job.name} (Key: ${job.key}) aus ${queue.name}`);
      }

      await queue.obliterate({ force: true });
      console.log(`[JobManager] Queue geleert: ${queue.name}`);
    }

    console.log('[JobManager] Alle Queues erfolgreich bereinigt.');
  } catch (err) {
    console.error('[JobManager] Fehler beim Bereinigen der Queues:', err);
    throw err;
  }
}

// --- SERVER START ---
async function startServer() {
  try {
    logBootConfig();

    console.log('[BOOT] Prüfe PostgreSQL-Verbindung...');
    const dbCheckResult = await db.query('SELECT current_database(), version();');
    console.log('[BOOT] PostgreSQL verbunden.');
    console.log('[BOOT] Aktive DB:', dbCheckResult.rows[0].current_database);
    console.log('[BOOT] PostgreSQL Version:', dbCheckResult.rows[0].version);

    console.log('[BOOT] Prüfe Redis-Verbindungen...');
    await connectRedisClients();
    console.log('[BOOT] Redis-Verbindungen sind bereit.');

    console.log('[BOOT] Starte Queue-Bereinigung...');
    await clearAllQueuesOnStartup();

    console.log('[Scheduler] Starte Cron-Ticker (Minutentakt)...');
    cron.schedule('* * * * *', async () => {
      try {
        console.log(`[Scheduler ${nowIso()}] Tick`);
        await runScheduledJobs();
      } catch (err) {
        console.error('[Scheduler] Fehler im Minutentakt:', err);
      }
    });
    
    console.log('[Scheduler] Starte Cron für täglichen E-Mail-Newsletter Check (08:30 Uhr)...');
    cron.schedule('30 8 * * *', async () => {
      try {
        console.log(`[Scheduler ${nowIso()}] Führe dispatchAutomatedNewsletters aus`);
        await dispatchAutomatedNewsletters();
      } catch (err) {
        console.error('[Scheduler] Fehler beim automatischen Newsletter-Versand:', err);
      }
    });

    app.listen(PORT, () => {
      console.log('==================================================');
      console.log(`[BOOT] Server läuft auf http://localhost:${PORT}`);
      console.log(`[BOOT] Bull Board: http://localhost:${PORT}/api/admin/jobs`);
      console.log('[BOOT] Backend erfolgreich gestartet.');
      console.log('==================================================');
    });

  } catch (err) {
    console.error('[BOOT] Kritischer Fehler beim Serverstart:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;