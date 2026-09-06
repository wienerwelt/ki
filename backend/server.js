// /var/www/vhosts/mobiliti.at/httpdocs/dashboard/backend/server.js

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

console.log("--- ENVIRONMENT CHECK ---");
console.log("NODE_ENV:", process.env.NODE_ENV || "undefined");
console.log("DB_HOST gesetzt:", process.env.DB_HOST ? "ja" : "nein");
console.log("DATABASE_URL gesetzt:", process.env.DATABASE_URL ? "ja" : "nein");
console.log("-------------------------");

// --- 1. IMPORTE ---
const express = require('express');
const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const cron = require('node-cron');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const adminAuth = require('./middleware/adminAuth');
const csrfProtection = require('./middleware/csrfProtection');

const db = require('./config/db');
const healthController = require('./controllers/healthController');
const auth = require('./middleware/authMiddleware');
const bullAuth = require('./middleware/bullAuth');
const jobManager = require('./services/jobManagerService');

// Scheduler
const { runScheduledJobs } = require('./services/cronjobScheduler');


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
const adminPublicAiAssistantRoutes = require('./routes/adminPublicAiAssistantRoutes');
const adminSalesLeadRoutes = require('./routes/adminSalesLeadRoutes');
const { resolvePublicAssistant, syncDuePublicAssistants, expandOriginVariants } = require('./services/publicAiAssistantService');
const softwareRoutes = require('./routes/softwareRoutes');
const accountRadarRoutes = require('./routes/accountRadarRoutes');
const accountRadarIntegrationRoutes = require('./routes/accountRadarIntegrationRoutes');



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

function assertSecurityConfig() {
  const jwtSecret = String(process.env.JWT_SECRET || '');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET fehlt oder ist zu kurz. Mindestens 32 zufällige Zeichen sind erforderlich.');
  }
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
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:', 'ws:', 'wss:'],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ["'self'", 'https://accounts.google.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
}));

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Auth-Token'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(cookieParser());
const defaultJsonParser = express.json({ limit: '1mb' });
const socialMediaJsonParser = express.json({ limit: '12mb' });
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin/social-media/')) {
    return adminAuth(req, res, () => socialMediaJsonParser(req, res, next));
  }
  return defaultJsonParser(req, res, next);
});
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(csrfProtection);

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
app.get('/api/health', healthController.getHealth);

app.use('/api/admin/jobs', bullAuth);
app.use('/api/admin/jobs', serverAdapter.getRouter());

app.use('/api/public', publicRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/integrations/account-radar/v1', accountRadarIntegrationRoutes);
app.use(updateLastActive);
app.use('/api/session', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.get('/api/data/active-advertisement', auth, dataController.getActiveAdvertisement);
app.use('/api/data', dataRoutes);
app.use('/api/account-radar', accountRadarRoutes);
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
app.use('/api/admin/public-assistant', adminPublicAiAssistantRoutes);
app.use('/api/admin/sales-leads', adminSalesLeadRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/software', softwareRoutes);


// Debug-Routen wurden aus Sicherheitsgründen entfernt.

// --- 5. FRONTEND & FEHLERBEHANDLUNG ---
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API Endpoint Not Found' });
});

const frontendDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
const publicDashboardOrigin = String(process.env.FRONTEND_URL || 'https://dashboard.mobiliti.at').replace(/\/$/, '');

const escapeSeoHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

// Isolierte Einbettungsseite für WordPress und andere freigegebene
// Mandanten-Websites. Nur diese Route darf in den konfigurierten Origins
// gerahmt werden; alle übrigen Dashboard-Seiten bleiben gegen Framing gesperrt.
app.get('/assistant/:siteKey', async (req, res, next) => {
  try {
    const assistant = await resolvePublicAssistant(req.params.siteKey);
    if (!assistant) return res.status(404).type('text/plain').send('Assistent nicht gefunden.');
    const configuredOrigins = Array.isArray(assistant.allowed_origins)
      ? Array.from(new Set(assistant.allowed_origins.flatMap((origin) => {
          try { return expandOriginVariants(origin, assistant.url_businesspartner); } catch (_error) { return []; }
        }))).filter((origin) => /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(String(origin)))
      : [];
    const ancestors = ["'self'", ...configuredOrigins].join(' ');
    const currentCsp = String(res.getHeader('Content-Security-Policy') || '');
    const nextCsp = /frame-ancestors\s+[^;]+/i.test(currentCsp)
      ? currentCsp.replace(/frame-ancestors\s+[^;]+/i, `frame-ancestors ${ancestors}`)
      : `${currentCsp}${currentCsp && !currentCsp.endsWith(';') ? ';' : ''}frame-ancestors ${ancestors};`;
    res.setHeader('Content-Security-Policy', nextCsp);
    res.removeHeader('X-Frame-Options');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-cache');
    const html = await fs.promises.readFile(frontendIndexPath, 'utf8');
    return res.type('html').send(html);
  } catch (error) {
    return next(error);
  }
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const partners = await db.query(`
      SELECT slug, updated_at
      FROM business_partners
      WHERE is_active = true AND slug IS NOT NULL AND BTRIM(slug) <> ''
      ORDER BY slug
    `);
    const urls = partners.rows.map((partner) => `
      <url>
        <loc>${escapeSeoHtml(`${publicDashboardOrigin}/${encodeURIComponent(partner.slug)}`)}</loc>
        <lastmod>${new Date(partner.updated_at || Date.now()).toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
      </url>`).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
      </urlset>`);
  } catch (error) {
    next(error);
  }
});

app.get('*', async (req, res, next) => {
  try {
    let html = await fs.promises.readFile(frontendIndexPath, 'utf8');
    const pathParts = req.path.split('/').filter(Boolean);
    const slug = pathParts.length === 1 ? decodeURIComponent(pathParts[0]).toLowerCase() : '';
    const reservedPaths = new Set(['login', 'register', 'dashboard', 'community', 'privacy', 'terms', 'disclaimer', 'cookie-settings']);

    if (slug && !reservedPaths.has(slug) && /^[a-z0-9_-]{1,120}$/.test(slug)) {
      const partnerResult = await db.query(`
        SELECT name, slug, dashboard_title, logo_url
        FROM business_partners
        WHERE lower(slug) = $1 AND is_active = true
        LIMIT 1
      `, [slug]);
      const partner = partnerResult.rows[0];
      if (partner) {
        const canonicalUrl = `${publicDashboardOrigin}/${encodeURIComponent(partner.slug)}`;
        const title = `${partner.dashboard_title || partner.name} | Branchenverzeichnis & Software-Lexikon`;
        const description = `${partner.name}: öffentliches Branchenverzeichnis, Software-Lexikon, Termine und ausgewählte Brancheninformationen.`.slice(0, 160);
        const logo = partner.logo_url && /^https?:\/\//i.test(partner.logo_url)
          ? partner.logo_url
          : `${publicDashboardOrigin}${partner.logo_url && partner.logo_url.startsWith('/') ? partner.logo_url : '/og-image.jpg'}`;

        html = html
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeSeoHtml(title)}</title>`)
          .replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${escapeSeoHtml(description)}" />`)
          .replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeSeoHtml(title)}" />`)
          .replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeSeoHtml(description)}" />`)
          .replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeSeoHtml(canonicalUrl)}" />`)
          .replace(/<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${escapeSeoHtml(logo)}" />`)
          .replace('</head>', `<link rel="canonical" href="${escapeSeoHtml(canonicalUrl)}" />\n  </head>`);
      }
    }

    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error('[EXPRESS] UNHANDLED ERROR:', err);
  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Die Anfrage ist größer als das erlaubte Limit.' });
  }
  res.status(500).json({
    message: process.env.NODE_ENV === 'production' ? 'Interner Serverfehler.' : err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    error: process.env.NODE_ENV === 'production' ? undefined : err
  });
});

// Entfernt nur alte Repeatable-Konfigurationen. Wartende und fehlgeschlagene
// Jobs bleiben bei Deployments erhalten und können vom Worker wiederaufgenommen werden.
async function clearLegacyRepeatableJobsOnStartup() {
  console.log('[JobManager] Entferne nur veraltete Repeatable-Jobs...');

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
    }

    console.log('[JobManager] Repeatable-Jobs bereinigt; Queue-Inhalte wurden erhalten.');
  } catch (err) {
    console.error('[JobManager] Fehler beim Bereinigen der Queues:', err);
    throw err;
  }
}

// --- SERVER START ---
async function startServer() {
  try {
    logBootConfig();
    assertSecurityConfig();

    console.log('[BOOT] Prüfe PostgreSQL-Verbindung...');
    const dbCheckResult = await db.query('SELECT current_database(), version();');
    console.log('[BOOT] PostgreSQL verbunden.');
    console.log('[BOOT] Aktive DB:', dbCheckResult.rows[0].current_database);
    console.log('[BOOT] PostgreSQL Version:', dbCheckResult.rows[0].version);

    console.log('[BOOT] Prüfe Redis-Verbindungen...');
    await connectRedisClients();
    console.log('[BOOT] Redis-Verbindungen sind bereit.');

    console.log('[BOOT] Prüfe veraltete Queue-Zeitpläne...');
    await clearLegacyRepeatableJobsOnStartup();

    console.log('[Scheduler] Starte Cron-Ticker (Minutentakt)...');
    cron.schedule('* * * * *', async () => {
      try {
        console.log(`[Scheduler ${nowIso()}] Tick`);
        await runScheduledJobs();
      } catch (err) {
        console.error('[Scheduler] Fehler im Minutentakt:', err);
      }
    });

    console.log('[Public AI] Plane tägliche Homepage-Synchronisierung...');
    cron.schedule('17 3 * * *', async () => {
      try {
        const count = await syncDuePublicAssistants();
        console.log(`[Public AI] Homepage-Synchronisierung abgeschlossen (${count} fällige Mandanten).`);
      } catch (err) {
        console.error('[Public AI] Fehler bei der Homepage-Synchronisierung:', err);
      }
    }, { timezone: 'Europe/Vienna' });
    
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
