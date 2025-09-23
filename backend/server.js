// Nur laden, wenn die Umgebung NICHT 'production' ist
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// --- 1. IMPORTE ---
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./config/db');
const auth = require('./middleware/authMiddleware');
const bullAuth = require('./middleware/bullAuth');
const jobManager = require('./services/jobManagerService');

// Bull Board & Queue
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// KORREKTUR 1: Importiere ALLE benötigten Queues direkt aus dem Service
const { 
  aiContentQueue, 
  scrapeQueue, 
  emailQueue, 
  dataUpdatesQueue,
  fundingQueue
} = require('./services/queueService');

// Routen (unverändert)
// ... (alle Ihre Routen-Imports) ...
const authRoutes = require('./routes/authRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');
const dataRoutes = require('./routes/dataRoutes');
const businessPartnerRoutes = require('./routes/businessPartnerRoutes');
const widgetRoutes = require('./routes/widgetRoutes');
const adminBusinessPartnerRoutes = require('./routes/adminBusinessPartnerRoutes.js');
const adminWidgetTypeRoutes = require('./routes/adminWidgetTypeRoutes.js');
const adminBpWidgetAccessRoutes = require('./routes/adminBpWidgetAccessRoutes.js');
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

// --- 2. INITIALISIERUNG & KONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 5000;

// Bull Board Adapter Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/jobs');

// KORREKTUR 2: Diese lokalen Deklarationen werden entfernt, da wir die Queues jetzt importieren
// const qAi     = new Queue('ai-content-generation',     { connection });
// const qScrape = new Queue('scrape-content-generation', { connection });
// const qEmails = new Queue('emails',                    { connection });

createBullBoard({
  // KORREKTUR 3: Verwende die direkt importierten Queue-Instanzen
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
// ... (Middleware-Code unverändert) ...
const allowedOrigins = ['http://localhost:5173', 'https://dashboard.mobiliti.at'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => { console.log(`[${req.method}] ${req.originalUrl}`); next(); });


// --- 4. ROUTEN ---
// ... (Routen-Code unverändert) ...
app.use('/api/admin/jobs', bullAuth);
app.use('/api/admin/jobs', serverAdapter.getRouter());


// REST-API
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/business-partner', businessPartnerRoutes);
app.use('/api/widgets', widgetRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/feedback', feedbackRoutes);
app.get('/api/data/active-advertisement', auth, dataController.getActiveAdvertisement);
app.use('/api/admin/business-partners', adminBusinessPartnerRoutes);
app.use('/api/admin/widget-types', adminWidgetTypeRoutes);
app.use('/api/admin/bp-widget-access', adminBpWidgetAccessRoutes);
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

// ... (Debug-Routen und Frontend-Serving unverändert) ...
// Debug
app.get('/api/debug/db-inspector', async (req, res) => {
  try {
    const dbNameResult = await db.query('SELECT current_database();');
    const currentDb = dbNameResult.rows[0].current_database;
    const tablesResult = await db.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
    const tables = tablesResult.rows.map(row => row.tablename);
    res.status(200).json({
      message: "Datenbank-Inspektor-Bericht",
      verbindung_hergestellt_zu_db: currentDb,
      gefundene_tabellen: tables
    });
  } catch (err) {
    res.status(500).json({ error: "Fehler im DB-Inspektor", message: err.message });
  }
});

app.get('/api/debug/users', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users');
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Abrufen der Daten" });
  }
});


// --- 5. FRONTEND & FEHLERBEHANDLUNG ---
app.use('/api/*', (req, res) => { res.status(404).json({ error: 'API Endpoint Not Found' }); });

const frontendDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));
app.get('*', (req, res) => { res.sendFile(path.join(frontendDistPath, 'index.html')); });

// Fehler-Handler (letzte Middleware)
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ message: err.message, stack: err.stack, error: err });
});


// --- 6. SERVERSTART ---
// ... (Serverstart-Logik unverändert) ...
if (require.main === module) {
  db.query('SELECT 1')
    .then(() => {
      console.log('PostgreSQL verbunden.');
      // Schedules nur hier synchronisieren (nicht in Workern)
      jobManager.synchronizeSchedulesFromDB();
      app.listen(PORT, () => {
        console.log(`Server läuft auf Port ${PORT}`);
      });
    })
    .catch(err => console.error('Fehler bei der PostgreSQL-Verbindung:', err));
}

module.exports = app;