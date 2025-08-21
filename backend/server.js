// backend/server.js
require('dotenv').config();

// --- 1. IMPORTE ---
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./config/db');
const auth = require('./middleware/authMiddleware');
const jobManager = require('./services/jobManagerService');

// Bull Board & Queue
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Routen
const authRoutes = require('./routes/authRoutes');
// ... (all your other routes)
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


// --- 2. INITIALISIERUNG & KONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 5000;

// Bull Board Adapter Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/jobs');

const bullBoardRedisConnection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null
});

const bullBoardQueue = new Queue('ai-content-generation', { connection: bullBoardRedisConnection });

createBullBoard({
  queues: [new BullMQAdapter(bullBoardQueue)],
  serverAdapter: serverAdapter,
});
console.log('Bull Board UI wurde mit dedizierter Verbindung initialisiert.');


// --- 3. MIDDLEWARE ---
// KORREKTUR: Vereinfachte und robustere CORS-Konfiguration
const allowedOrigins = ['http://localhost:5173', 'https://dashboard.mobiliti.at'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => { console.log(`[${req.method}] ${req.originalUrl}`); next(); });


// --- 4. ROUTEN ---
app.use('/api/admin/jobs', serverAdapter.getRouter());

// ... (alle Ihre anderen Routen bleiben hier unverändert)
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
app.get('/api/debug/db-inspector', async (req, res) => { try { const dbConfig = db.options; const dbNameResult = await db.query('SELECT current_database();'); const currentDb = dbNameResult.rows[0].current_database; const tablesResult = await db.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;"); const tables = tablesResult.rows.map(row => row.tablename); res.status(200).json({ message: "Datenbank-Inspektor-Bericht", verbindung_hergestellt_zu_db: currentDb, benutzter_user: dbConfig.user, benutzter_host: dbConfig.host, gefundene_tabellen: tables }); } catch (err) { res.status(500).json({ error: "Fehler im DB-Inspektor", message: err.message }); } });
app.get('/api/debug/users', async (req, res) => { try { const { rows } = await db.query('SELECT * FROM users'); res.status(200).json(rows); } catch (err) { res.status(500).json({ error: "Fehler beim Abrufen der Daten" }); } });


// --- 5. FRONTEND & FEHLERBEHANDLUNG ---
app.use('/api/*', (req, res) => { res.status(404).json({ error: 'API Endpoint Not Found' }); });
const frontendDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));
app.get('*', (req, res) => { res.sendFile(path.join(frontendDistPath, 'index.html')); });
app.use((err, req, res, next) => { console.error('UNHANDLED ERROR:', err); res.status(500).json({ message: err.message, stack: err.stack, error: err }); });


// --- 6. SERVERSTART ---
db.query('SELECT 1').then(() => { console.log('PostgreSQL verbunden.'); jobManager.synchronizeSchedulesFromDB(); app.listen(PORT, () => { console.log(`Server läuft auf Port ${PORT}`); }); }).catch(err => console.error('Fehler bei der PostgreSQL-Verbindung:', err));