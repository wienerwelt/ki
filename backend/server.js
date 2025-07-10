// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const db = require('./config/db');
const { logActivity } = require('./services/auditLogService');

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

// Service-Importe
const scraperService = require('./services/scraperService');
const cron = require('node-cron');
const { processAllActiveSubscriptions } = require('./services/intelligentContentService');

const app = express();
const PORT = process.env.PORT || 5000;

// KORREKTE REIHENFOLGE DER MIDDLEWARE
// 1. CORS-Konfiguration, um Cross-Origin-Anfragen zu erlauben
app.use(cors({
    origin: 'http://localhost:5173', // Erlaubt explizit Anfragen von Ihrem Vite-Frontend
    credentials: true,
}));

// 2. Body-Parser für JSON-Anfragen
app.use(express.json());

// 3. Session-Konfiguration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production' },
}));


// DB-Verbindung
db.query('SELECT 1')
    .then(() => {
        console.log('PostgreSQL connected successfully!');
        scraperService.startAllScrapingJobs();
        setInterval(scraperService.startAllScrapingJobs, 30 * 60 * 1000);
    })
    .catch(err => console.error('PostgreSQL connection error:', err));

// 4. API-Routen
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/business-partner', businessPartnerRoutes);
app.use('/api/widgets', widgetRoutes);

// Admin-API-Routen
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

app.get('/', (req, res) => {
    res.send('Welcome to KI-Dashboard Backend! Access /api/auth/login or /api/auth/register for more.');
});

// Cronjob für Content-Abos
console.log('Führe initialen Job für Content-Abos direkt nach dem Start aus...');
processAllActiveSubscriptions();

cron.schedule('0 2 * * *', async () => {
    const actionType = 'CRON_JOB_CONTENT_SUBSCRIPTION';
    console.log(`[${new Date().toISOString()}] Starting daily cron job: ${actionType}`);
    await logActivity({ actionType: `${actionType}_START`, status: 'success' });

    try {
        await processAllActiveSubscriptions();
        console.log(`[${new Date().toISOString()}] Successfully finished cron job: ${actionType}`);
        await logActivity({ actionType: `${actionType}_SUCCESS`, status: 'success' });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Cron job failed: ${actionType}`, error);
        await logActivity({
            actionType: `${actionType}_FAILURE`,
            status: 'failure',
            details: { error: error.message, stack: error.stack }
        });
    }
}, {
    scheduled: true,
    timezone: "Europe/Vienna"
});

// Globale Fehlerbehandlungs-Middleware (muss am Ende stehen)
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    logActivity({
        actionType: 'SERVER_START',
        status: 'success',
        details: { message: `Server started on port ${PORT}` }
    });
});