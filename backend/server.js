// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const { logActivity } = require('./services/auditLogService');
const cookieParser = require('cookie-parser');
const auth = require('./middleware/authMiddleware');
const path = require('path');

// Routen-Importe
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

// Controller-Importe
const dataController = require('./controllers/dataController');

// Service-Importe
const jobManager = require('./services/jobManagerService');

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { aiContentQueue } = require('./services/queueService');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Bull Board Dashboard Setup ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/jobs');

createBullBoard({
  queues: [new BullMQAdapter(aiContentQueue)],
  serverAdapter: serverAdapter,
});

// --- CORS Setup ---
const allowedOrigins = [
  'http://localhost:5173',
  'https://dashboard.mobiliti.at'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// --- Standard Middleware ---
app.use(express.json());
app.use(cookieParser());

// --- Logging aller Requests ---
app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.originalUrl}`);
    next();
});

// DB-Verbindung
db.query('SELECT 1')
    .then(() => {
        console.log('PostgreSQL connected successfully!');
        jobManager.synchronizeSchedulesFromDB();
    })
    .catch(err => console.error('PostgreSQL connection error:', err));

// ======================================================
// WICHTIGE ÄNDERUNG: Bull Board Route wird hier registriert
app.use('/api/admin/jobs', serverAdapter.getRouter());
// ======================================================

// --- API-Routen ---
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

// --- Admin-API-Routen ---
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

// ======================================================
// TEMPORÄRE DATENBANK-INSPEKTOR-ROUTE
// ======================================================
app.get('/api/debug/db-inspector', async (req, res) => {
    try {
        console.log("--- Datenbank-Inspektor wird ausgeführt ---");
        const dbConfig = db.options;
        console.log("Verbinde mit folgender Konfiguration:", dbConfig);
        const dbNameResult = await db.query('SELECT current_database();');
        const currentDb = dbNameResult.rows[0].current_database;
        console.log("Erfolgreich verbunden mit Datenbank:", currentDb);
        const tablesResult = await db.query(`
            SELECT tablename
            FROM pg_catalog.pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        `);
        const tables = tablesResult.rows.map(row => row.tablename);
        console.log("Gefundene Tabellen:", tables);
        res.status(200).json({
            message: "Datenbank-Inspektor-Bericht",
            verbindung_hergestellt_zu_db: currentDb,
            benutzter_user: dbConfig.user,
            benutzter_host: dbConfig.host,
            gefundene_tabellen: tables
        });
    } catch (err) {
        console.error("Fehler im DB-Inspektor:", err);
        res.status(500).json({
            error: "Fehler im DB-Inspektor",
            message: err.message,
            stack: err.stack,
            verbindungs_konfiguration: db.options
        });
    }
});
// ======================================================

// ======================================================
// TEMPORÄRE DEBUG-ROUTE
// ======================================================
app.get('/api/debug/users', async (req, res) => {
    try {
        console.log("--- Abrufen aller Benutzer für das Debugging ---");
        const { rows } = await db.query('SELECT * FROM users');
        console.log("Gefundene Benutzer:", rows);
        console.log(`--- Insgesamt ${rows.length} Benutzer gefunden ---`);
        res.status(200).json(rows);
    } catch (err) {
        console.error("Fehler bei der Debug-Abfrage:", err);
        res.status(500).json({ error: "Fehler beim Abrufen der Daten" });
    }
});

// --- API 404-HANDLER ---
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API Endpoint Not Found' });
});

// --- SERVE FRONTEND STATIC FILES ---
const frontendDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// --- CATCH-ALL ROUTE FÜR FRONTEND ---
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// --- Globale Fehlerbehandlungs-Middleware ---
app.use((err, req, res, next) => {
    console.error('UNHANDLED ERROR:', err);
    res.status(500).json({ message: err.message, stack: err.stack, error: err });
});

// --- Serverstart ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});