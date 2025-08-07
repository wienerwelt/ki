// backend/server.js
require('dotenv').config();
const express = require('express');
const dotenv = require('dotenv');
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

// Controller-Importe
const dataController = require('./controllers/dataController');

// Service-Importe
const jobManager = require('./services/jobManagerService'); // Wichtig für die Redis-Synchronisation

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { aiContentQueue } = require('./services/queueService'); // Importiere deine Queue

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- Bull Board Dashboard Setup ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/jobs'); // Der Pfad, unter dem das Dashboard erreichbar ist

createBullBoard({
  queues: [new BullMQAdapter(aiContentQueue)], // Füge hier deine Queues hinzu
  serverAdapter: serverAdapter,
});

// --- CORS Setup ---
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));


// --- Standard Middleware ---
app.use(express.json());
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, '..', 'frontend', 'public')));

// --- Logging aller Requests ---
app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.originalUrl}`);
    next();
});

// DB-Verbindung und anschließende Synchronisation der Redis-Jobs
db.query('SELECT 1')
    .then(() => {
        console.log('PostgreSQL connected successfully!');
        // Starte die Synchronisation der Zeitpläne aus der DB mit der Redis-Queue
        jobManager.synchronizeSchedulesFromDB();
    })
    .catch(err => console.error('PostgreSQL connection error:', err));

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

// Einzelne, geschützte Route
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
app.use('/api/admin/jobs', serverAdapter.getRouter());
app.use('/api/admin/sources', adminSourcesRoutes);

// Testroute
app.get('/', (req, res) => {
    res.send('Welcome to KI-Dashboard Backend!');
});

// --- Globale Fehlerbehandlungs-Middleware ---
app.use((err, req, res, next) => {
    console.error('UNHANDLED ERROR:', err);
    logActivity({
        actionType: 'CRITICAL_ERROR',
        status: 'failure',
        details: {
            error: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method
        },
        ipAddress: req.ip
    });
    res.status(500).send('Ein interner Serverfehler ist aufgetreten.');
});

// --- Serverstart ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    logActivity({
        actionType: 'SERVER_START',
        status: 'success',
        details: { message: `Server started on port ${PORT}` }
    });
});
