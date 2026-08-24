// backend/services/reportingService.js
const db = require('../config/db');
const { ACTIVE_MEMBERSHIP_SQL } = require('../utils/membershipExpiry');
const { sendEmail } = require('./emailService');
const { renderMonthlyPartnerReportEmail } = require('./emailTemplates');
const { connection: redisClient, heartbeatRedisClient } = require('./queueService');

/**
 * Hilfsfunktion zur Berechnung und Formatierung des Vortags-Trends
 */
function getTrendIndicator(current, previous) {
    if (previous === 0) {
        return current > 0 ? `<span style="color: #2e7d32; font-weight: bold;">▲ +${current} (Neu)</span>` : '<span style="color: #757575;">→ 0</span>';
    }
    const diff = current - previous;
    const percent = Math.round((diff / previous) * 100);
    
    if (diff > 0) {
        return `<span style="color: #2e7d32; font-weight: bold;">▲ +${diff} (+${percent}%)</span>`;
    } else if (diff < 0) {
        return `<span style="color: #d32f2f; font-weight: bold;">▼ ${diff} (${percent}%)</span>`;
    }
    return '<span style="color: #757575;">→ 0 (Gleich)</span>';
}

function normalizeEnvironmentValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;

    if (['production', 'prod', 'live'].includes(normalized)) {
        return 'production';
    }

    if (['development', 'dev', 'local', 'test'].includes(normalized)) {
        return 'development';
    }

    return null;
}

function resolveRuntimeEnvironment(dashboardUrl = '') {
    const candidates = [
        { key: 'REPORT_ENV', value: process.env.REPORT_ENV },
        { key: 'APP_ENV', value: process.env.APP_ENV },
        { key: 'DEPLOY_ENV', value: process.env.DEPLOY_ENV },
        { key: 'NODE_ENV', value: process.env.NODE_ENV }
    ];

    for (const candidate of candidates) {
        const normalized = normalizeEnvironmentValue(candidate.value);
        if (normalized) {
            return {
                name: normalized,
                label: normalized === 'production' ? 'PRODUCTION' : 'DEVELOPMENT',
                isProduction: normalized === 'production',
                source: candidate.key,
                rawValue: candidate.value
            };
        }
    }

    const url = String(dashboardUrl || '').toLowerCase();
    if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        return {
            name: 'production',
            label: 'PRODUCTION',
            isProduction: true,
            source: 'FRONTEND_URL',
            rawValue: dashboardUrl
        };
    }

    return {
        name: 'development',
        label: 'DEVELOPMENT',
        isProduction: false,
        source: 'fallback',
        rawValue: 'missing-env'
    };
}

async function getDailyStats() {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const vortagStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const queries = [
        // 1) Neue User (rolling 24h vs Vortag 24h)
        db.query(
            `SELECT 
                COUNT(CASE WHEN created_at >= $1 THEN 1 END)::int AS current,
                COUNT(CASE WHEN created_at >= $2 AND created_at < $1 THEN 1 END)::int AS previous
             FROM users 
             WHERE created_at >= $2`,
            [since, vortagStart]
        ),

        // 2) Erfolgreiche Logins
        db.query(
            `SELECT 
                COUNT(CASE WHEN timestamp >= $1 THEN 1 END)::int AS current,
                COUNT(CASE WHEN timestamp >= $2 AND timestamp < $1 THEN 1 END)::int AS previous
             FROM activity_log
             WHERE action_type = 'LOGIN_SUCCESS' AND status = 'success' AND timestamp >= $2`,
            [since, vortagStart]
        ),

        // 3) Datei-Uploads
        db.query(
            `SELECT 
                COUNT(CASE WHEN created_at >= $1 THEN 1 END)::int AS current,
                COUNT(CASE WHEN created_at >= $2 AND created_at < $1 THEN 1 END)::int AS previous
             FROM business_partner_files
             WHERE created_at >= $2`,
            [since, vortagStart]
        ),

        // 4) Tokens aus activity_log (UI / Analysis)
        db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN timestamp >= $1 THEN (details->'tokenUsage'->>'totalTokens')::int ELSE 0 END), 0)::int AS current,
                COALESCE(SUM(CASE WHEN timestamp >= $2 AND timestamp < $1 THEN (details->'tokenUsage'->>'totalTokens')::int ELSE 0 END), 0)::int AS previous
             FROM activity_log
             WHERE action_type LIKE 'AI_%_SUCCESS' AND timestamp >= $2`,
            [since, vortagStart]
        ),

        // 5) Tokens aus ai_usage_logs (Jobs / Background)
        db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN created_at >= $1 THEN total_tokens ELSE 0 END), 0)::int AS current,
                COALESCE(SUM(CASE WHEN created_at >= $2 AND created_at < $1 THEN total_tokens ELSE 0 END), 0)::int AS previous
             FROM ai_usage_logs
             WHERE created_at >= $2`,
            [since, vortagStart]
        ),

        // 6) Gescrapte Inhalte (Rows)
        db.query(
            `SELECT 
                COUNT(CASE WHEN scraped_at >= $1 THEN 1 END)::int AS current,
                COUNT(CASE WHEN scraped_at >= $2 AND scraped_at < $1 THEN 1 END)::int AS previous
             FROM scraped_content
             WHERE scraped_at >= $2`,
            [since, vortagStart]
        ),

        // 7) Abgeschlossene Scraping-Jobs
        db.query(
            `SELECT 
                COUNT(CASE WHEN completed_at >= $1 THEN 1 END)::int AS current,
                COUNT(CASE WHEN completed_at >= $2 AND completed_at < $1 THEN 1 END)::int AS previous
             FROM scraping_jobs
             WHERE status = 'completed' AND completed_at >= $2`,
            [since, vortagStart]
        ),

        // 8) Neue Ideen & Vorschläge aus dem Feedback-Board
        db.query(
            `SELECT
                COUNT(CASE WHEN created_at >= $1 THEN 1 END)::int AS current,
                COUNT(CASE WHEN created_at >= $2 AND created_at < $1 THEN 1 END)::int AS previous
             FROM feedback_items
             WHERE type IN ('idea', 'suggestion')
               AND created_at >= $2`,
            [since, vortagStart]
        ),
        
        // 9) S3 Speicher Gesamt (Globaler Ist-Zustand, kein Delta)
        db.query(
            `SELECT COUNT(*)::int AS count, COALESCE(SUM(file_size), 0) AS total_bytes FROM business_partner_files`
        )
    ];

    const results = await Promise.all(queries);

    return {
        timeframe: {
            start: since.toISOString(),
            end: now.toISOString()
        },
        newUsers: results[0].rows[0],
        successfulLogins: results[1].rows[0],
        fileUploads: results[2].rows[0],
        tokensActivityLog: results[3].rows[0],
        tokensUsageLogs: results[4].rows[0],
        scrapedContents: results[5].rows[0],
        scrapingJobsCompleted: results[6].rows[0],
        newIdeas: results[7].rows[0],
        s3: {
            totalFiles: results[8].rows[0].count,
            storageMb: (Number(results[8].rows[0].total_bytes || 0) / (1024 * 1024)).toFixed(2)
        }
    };
}

function formatReportAsHtml(stats, environmentInfo, dashboardUrl) {
    const start = new Date(stats.timeframe.start).toLocaleString('de-AT');
    const end = new Date(stats.timeframe.end).toLocaleString('de-AT');
    const environmentLabel = typeof environmentInfo === 'string'
        ? environmentInfo.toUpperCase()
        : environmentInfo.label;
    const environmentSource = typeof environmentInfo === 'string'
        ? 'NODE_ENV'
        : environmentInfo.source;
    const isProd = typeof environmentInfo === 'string'
        ? environmentLabel === 'PRODUCTION'
        : environmentInfo.isProduction;

    return `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto;">
            <div style="padding: 15px; background-color: ${isProd ? '#fee2e2' : '#e0f2fe'}; border: 1px solid ${isProd ? '#fca5a5' : '#7dd3fc'}; borderRadius: 6px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 16px; color: ${isProd ? '#991b1b' : '#0369a1'}; font-weight: bold;">
                    📡 System-Umgebung: ${environmentLabel}
                </p>
                <p style="margin: 5px 0 0 0; font-size: 13px; color: #475569;">
                    URL: <a href="${dashboardUrl}" target="_blank" style="color: #1976d2; font-weight: bold;">${dashboardUrl}</a>
                </p>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">
                    Erkennung über: ${environmentSource}
                </p>
            </div>

            <h1>Dashboard – Admin Tagesreport</h1>
            <p><strong>Zeitraum:</strong> ${start} – ${end} (rolling 24h vs. Vorblende-Vortag)</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>

            <table style="width:100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="background:#e2e8f0; text-align: left;">
                        <th style="padding:12px; border:1px solid #cbd5e1;">KPI</th>
                        <th style="padding:12px; border:1px solid #cbd5e1; text-align: right;">Letzte 24h</th>
                        <th style="padding:12px; border:1px solid #cbd5e1; text-align: right;">Vortag 24h</th>
                        <th style="padding:12px; border:1px solid #cbd5e1; text-align: center;">Veränderung (Delta)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:10px; border:1px solid #e2e8f0;">Neue Benutzer</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.newUsers.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.newUsers.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.newUsers.current, stats.newUsers.previous)}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:10px; border:1px solid #e2e8f0;">Erfolgreiche Logins</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.successfulLogins.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.successfulLogins.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.successfulLogins.current, stats.successfulLogins.previous)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px; border:1px solid #e2e8f0;">Datei-Uploads</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.fileUploads.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.fileUploads.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.fileUploads.current, stats.fileUploads.previous)}</td>
                    </tr>
                    <tr style="background:#ecfeff;">
                        <td style="padding:10px; border:1px solid #e2e8f0;">Neue Ideen & Vorschläge</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.newIdeas.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.newIdeas.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.newIdeas.current, stats.newIdeas.previous)}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:10px; border:1px solid #e2e8f0;">Gescrapte Inhalte</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.scrapedContents.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.scrapedContents.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.scrapedContents.current, stats.scrapedContents.previous)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px; border:1px solid #e2e8f0;">Abgeschlossene Scraping-Jobs</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.scrapingJobsCompleted.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.scrapingJobsCompleted.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.scrapingJobsCompleted.current, stats.scrapingJobsCompleted.previous)}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:10px; border:1px solid #e2e8f0;">AI Tokens (UI/User requests)</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.tokensActivityLog.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.tokensActivityLog.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.tokensActivityLog.current, stats.tokensActivityLog.previous)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px; border:1px solid #e2e8f0;">AI Tokens (Background-Jobs)</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right;"><strong>${stats.tokensUsageLogs.current}</strong></td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: right; color: #64748b;">${stats.tokensUsageLogs.previous}</td>
                        <td style="padding:10px; border:1px solid #e2e8f0; text-align: center;">${getTrendIndicator(stats.tokensUsageLogs.current, stats.tokensUsageLogs.previous)}</td>
                    </tr>
                    <tr style="background:#f1f5f9; font-weight: bold;">
                        <td style="padding:10px; border:1px solid #cbd5e1;">AI Tokens Gesamt</td>
                        <td style="padding:10px; border:1px solid #cbd5e1; text-align: right;">${stats.tokensActivityLog.current + stats.tokensUsageLogs.current}</td>
                        <td style="padding:10px; border:1px solid #cbd5e1; text-align: right; color: #64748b;">${stats.tokensActivityLog.previous + stats.tokensUsageLogs.previous}</td>
                        <td style="padding:10px; border:1px solid #cbd5e1; text-align: center;">${getTrendIndicator(stats.tokensActivityLog.current + stats.tokensUsageLogs.current, stats.tokensActivityLog.previous + stats.tokensUsageLogs.previous)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px; border:1px solid #e2e8f0; color: #1976d2; font-weight: bold;">S3 Speicher Ist-Zustand</td>
                        <td colSpan="3" style="padding:10px; border:1px solid #e2e8f0; color: #1976d2; font-weight: bold; text-align: center;">
                            ${stats.s3.storageMb} MB (${stats.s3.totalFiles} Dateien gesamt)
                        </td>
                    </tr>
                </tbody>
            </table>

            <p style="margin-top:25px; font-size:12px; color:#888; text-align: center;">
                Automatisch generierter System-Infrastruktur-Report (rolling 48h Matrix).
            </p>
        </div>
    `;
}

exports.generateAndSendDailyReport = async () => {
    try {
        const stats = await getDailyStats();
        const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const environmentInfo = resolveRuntimeEnvironment(dashboardUrl);
        const environmentLabel = environmentInfo.label;
        
        let htmlContent = formatReportAsHtml(stats, environmentInfo, dashboardUrl);

        htmlContent += `
            <p style="margin-top: 20px; text-align: center;">
                <a href="${dashboardUrl}/admin/monitor" style="padding: 12px 20px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
                    Direkt zum Admin-Dashboard
                </a>
            </p>
        `;

        await sendEmail({
            to: process.env.EMAIL_ADMIN,
            subject: `[${environmentLabel}] Admin Report – KPI-Vergleich & Deltas`,
            html: htmlContent,
            fromName: `Dashboard Admin (${environmentLabel})`
        });

        console.log('[Reporting] Admin Daily Report erfolgreich versendet.', {
            environment: environmentLabel,
            detectedBy: environmentInfo.source,
            rawValue: environmentInfo.rawValue,
            nodeEnv: process.env.NODE_ENV,
            appEnv: process.env.APP_ENV,
            deployEnv: process.env.DEPLOY_ENV,
            reportEnv: process.env.REPORT_ENV,
            frontendUrl: dashboardUrl
        });
    } catch (error) {
        console.error('[Reporting] Fehler beim Senden des Admin Daily Reports:', error);
    }
};


/**
 * =========================
 * SYSTEM HEALTH MONITOR & ALERTING
 * Sendet genau EINE Warnung beim Ausfall und EINE Entwarnung bei Recovery.
 * =========================
 */
let redisEmergencyLock = false; // Memory Lock, falls das Redis komplett stirbt

exports.checkSystemHealthAndAlert = async () => {
    if (!process.env.EMAIL_ADMIN) return;

    const alerts = [];
    const recoveries = [];

    // Hilfsfunktion, um Status zu setzen und Flut von Mails zu verhindern
    async function processServiceStatus(name, isUp, errorMsg = '') {
        const lockKey = `alert_lock:${name.replace(/\s+/g, '_')}`;
        try {
            const isLocked = await redisClient.get(lockKey);
            if (!isUp) {
                if (!isLocked) {
                    alerts.push({ service: name, error: errorMsg });
                    await redisClient.set(lockKey, '1'); // Lock dauerhaft setzen (bis zur Recovery)
                }
            } else {
                if (isLocked) {
                    recoveries.push({ service: name });
                    await redisClient.del(lockKey); // Lock entfernen -> Dienst wieder gesund
                }
            }
        } catch (err) {
            console.error(`[Monitor] Fehler beim Lock für ${name}:`, err.message);
        }
    }

    // 1. Datenbank Check
    try {
        await db.query('SELECT 1');
        await processServiceStatus('PostgreSQL', true);
    } catch (err) {
        await processServiceStatus('PostgreSQL', false, err.message);
    }

    // 2. Redis Check
    try {
        const pong = await redisClient.ping();
        if (pong !== 'PONG') throw new Error('Ungültige PING Antwort');
        
        if (redisEmergencyLock) {
            recoveries.push({ service: 'Haupt-Redis' });
            redisEmergencyLock = false;
        }
    } catch (err) {
        if (!redisEmergencyLock) {
            console.error('[Monitor] 🚨 Haupt-Redis ist DOWN! Sende Notfall-Mail...');
            await sendEmail({
                to: process.env.EMAIL_ADMIN,
                subject: `🚨 KRITISCHER FEHLER: Redis offline!`,
                html: `<h2 style="color: red;">Redis Ausfall</h2><p>Die Haupt-Datenbank für Queues reagiert nicht mehr.</p><p><strong>Fehler:</strong> ${err.message}</p>`,
                fromName: 'Dashboard Monitor'
            });
            redisEmergencyLock = true;
        }
        return; // Ohne Redis können wir keine Worker checken oder Locks abfragen
    }

    // 3. Worker Checks
    const workersToCheck = ['aiWorker', 'scrapeWorker', 'emailWorker', 'dataUpdateWorker', 'fundingWorker'];
    try {
        const heartbeatKeys = workersToCheck.map(name => `worker_heartbeat:${name}`);
        const heartbeats = await heartbeatRedisClient.mget(heartbeatKeys);
        const now = new Date();

        for (let i = 0; i < workersToCheck.length; i++) {
            const name = workersToCheck[i];
            const heartbeat = heartbeats[i];
            
            if (!heartbeat) {
                await processServiceStatus(`Worker: ${name}`, false, 'Kein Heartbeat in Redis gefunden.');
            } else {
                const lastBeat = new Date(heartbeat);
                const diffSeconds = (now - lastBeat) / 1000;
                
                if (diffSeconds > 120) {
                    await processServiceStatus(`Worker: ${name}`, false, `Inaktiv seit ${Math.round(diffSeconds)} Sekunden.`);
                } else {
                    await processServiceStatus(`Worker: ${name}`, true); // Recovery prüfen & triggern
                }
            }
        }
    } catch (err) {
        await processServiceStatus('Heartbeat-Redis', false, err.message);
    }

    // 4. Mails versenden (Alerts)
    if (alerts.length > 0) {
        let emailHtml = `<h2 style="color: red;">Kritische System-Warnung</h2><p>Folgende Dienste sind ausgefallen:</p><ul>`;
        alerts.forEach(a => emailHtml += `<li><strong>${a.service}:</strong> ${a.error}</li>`);
        emailHtml += `</ul><p><em>Du erhältst für diese Ausfälle keine weiteren E-Mails, bis die Dienste wieder online sind.</em></p>`;

const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
emailHtml += `</ul><p><em>Du erhältst für diese Ausfälle keine weiteren E-Mails, bis die Dienste wieder online sind.</em></p>
<p><a href="${dashboardUrl}/admin/monitor" style="padding: 10px 15px; background-color: #d32f2f; color: white; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">Zum Admin-Dashboard</a></p>`;

        await sendEmail({
            to: process.env.EMAIL_ADMIN,
            subject: `🚨 SYSTEMWARNUNG: ${alerts.length} Dienste offline!`,
            html: emailHtml,
            fromName: 'Dashboard Monitor'
        });
        console.log(`[Monitor] Warn-E-Mail versendet für ${alerts.length} Dienste.`);
    }

    // 5. Mails versenden (Recoveries)
    if (recoveries.length > 0) {
        let emailHtml = `<h2 style="color: green;">System-Entwarnung</h2><p>Folgende Dienste sind wieder online und funktionieren normal:</p><ul>`;
        recoveries.forEach(r => emailHtml += `<li><strong>${r.service}</strong> ist wieder erreichbar.</li>`);
        emailHtml += `</ul>`;

const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
emailHtml += `</ul>
<p><a href="${dashboardUrl}/admin/monitor" style="padding: 10px 15px; background-color: #2e7d32; color: white; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">Zum Admin-Dashboard</a></p>`;        

        await sendEmail({
            to: process.env.EMAIL_ADMIN,
            subject: `✅ ENTWARNUNG: ${recoveries.length} Dienste wieder online`,
            html: emailHtml,
            fromName: 'Dashboard Monitor'
        });
        console.log(`[Monitor] Entwarnungs-E-Mail versendet für ${recoveries.length} Dienste.`);
    }
};

/**
 * =========================
 * BRIEFING NEWSLETTER (AUTO-PUBLISH)
 * =========================
 */

exports.generateAndSendBriefingNewsletters = async () => {
    console.warn('[mail] Veralteter Briefing-Einstieg verwendet; delegiere an den zentralen Dispatcher.');
    const { dispatchAutomatedNewsletters } = require('./marketBriefingService');
    return dispatchAutomatedNewsletters();
};


/**
 * =========================
 * MANDANTEN – MONTHLY ROI REPORT
 * Zielgruppe: 'assistenz' & 'admin' des jeweiligen BPs
 * Zeitraum: Letzter voller Kalendermonat vs. Monat davor
 * =========================
 */
exports.generateAndSendMonthlyReport = async (options = {}) => {
    const dryRun = Boolean(options.dryRun);
    const targetBusinessPartnerId = options.targetBusinessPartnerId || null;
    const includeUnsubscribedRecipients = dryRun && Boolean(options.includeUnsubscribedRecipients);
    const collectPreviewDetails = dryRun && Boolean(options.collectPreviewDetails);
    console.log(
        '[Reporting] Starte Generierung der monatlichen Mandanten-Reports...'
    );

    /*
     * Halboffene Zeiträume:
     *
     * Letzter Monat:
     * >= lastMonthStart
     * <  currentMonthStart
     *
     * Monat davor:
     * >= prevMonthStart
     * <  lastMonthStart
     */
    const now = new Date();

    const currentMonthStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
    ));

    const lastMonthStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 1,
        1
    ));

    const prevMonthStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 2,
        1
    ));

    console.log('[Reporting] Berichtszeitraum:', {
        previousMonth: {
            from: prevMonthStart.toISOString(),
            toExclusive: lastMonthStart.toISOString()
        },
        reportMonth: {
            from: lastMonthStart.toISOString(),
            toExclusive: currentMonthStart.toISOString()
        }
    });

    const client = await db.connect();

    try {
        if (typeof renderMonthlyPartnerReportEmail !== 'function') {
            throw new Error(
                'renderMonthlyPartnerReportEmail fehlt oder wird nicht aus emailTemplates.js exportiert.'
            );
        }

        /*
         * Prüfen, welche Zeitspalte in user_read_scraped_content existiert.
         * Je nach Datenbankstand kann sie read_at oder created_at heißen.
         */
        const { rows: readColumnRows } = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'user_read_scraped_content'
              AND column_name IN ('read_at', 'created_at')
            ORDER BY
                CASE column_name
                    WHEN 'read_at' THEN 1
                    WHEN 'created_at' THEN 2
                    ELSE 3
                END
            LIMIT 1
        `);

        if (readColumnRows.length === 0) {
            throw new Error(
                'Die Tabelle user_read_scraped_content besitzt weder die Spalte read_at noch created_at.'
            );
        }

        const readTimestampColumn = readColumnRows[0].column_name;

        console.log(
            `[Reporting] Zeitspalte für gelesene Inhalte: ${readTimestampColumn}`
        );

        const partnerParams = [];
        let partnerWhere = 'bp.is_active = TRUE';
        if (!(collectPreviewDetails && targetBusinessPartnerId)) {
            partnerWhere += ' AND COALESCE(bp.allow_automated_newsletter, FALSE) = TRUE';
        }
        if (targetBusinessPartnerId) {
            partnerParams.push(targetBusinessPartnerId);
            partnerWhere += ` AND bp.id = $1::uuid`;
        }

        const { rows: partners } = await client.query(`
            SELECT
                bp.*,
                row_to_json(cs.*) AS color_scheme
            FROM business_partners bp
            LEFT JOIN color_schemes cs
                ON bp.color_scheme_id = cs.id
            WHERE ${partnerWhere}
            ORDER BY bp.name ASC
        `, partnerParams);

        console.log(
            `[Reporting] ${partners.length} aktive Partner gefunden.`
        );

        let sentCount = 0;
        let plannedCount = 0;
        let skippedPartnerCount = 0;
        let skippedAlreadySentCount = 0;
        let failedCount = 0;
        const previews = [];
        const reportMonth = lastMonthStart.toISOString().slice(0, 10);

        for (const partner of partners) {
            const optInCondition = includeUnsubscribedRecipients ? '' : 'AND newsletter_opt_in = TRUE';
            const { rows: recipients } = await client.query(`
                SELECT
                    id,
                    email,
                    first_name,
                    last_name,
                    role
                FROM users u
                WHERE business_partner_id = $1
                  AND role IN ('assistenz', 'admin')
                  ${optInCondition}
                  AND is_active = TRUE
                  AND ${ACTIVE_MEMBERSHIP_SQL}
                  AND email IS NOT NULL
                  AND TRIM(email) <> ''
                ORDER BY email ASC
            `, [partner.id]);

            if (recipients.length === 0) {
                skippedPartnerCount++;

                console.log(
                    `[Reporting] Keine aktiven Empfänger mit Opt-in für Partner "${partner.name}".`
                );

                if (!collectPreviewDetails) continue;
            }

            console.log(
                `[Reporting] Berechne Monatsreport für Partner "${partner.name}" ` +
                `mit ${recipients.length} Empfänger(n).`
            );

            const queryParams = [
                lastMonthStart,
                currentMonthStart,
                prevMonthStart,
                partner.id
            ];

            const [
                loginsRes,
                readsRes,
                communityRes,
                downloadsRes
            ] = await Promise.all([
                client.query(`
                    SELECT
                        COUNT(*) FILTER (
                            WHERE timestamp >= $1
                              AND timestamp < $2
                        )::int AS current_logins,

                        COUNT(*) FILTER (
                            WHERE timestamp >= $3
                              AND timestamp < $1
                        )::int AS prev_logins
                    FROM activity_log
                    WHERE action_type = 'LOGIN_SUCCESS'
                      AND status = 'success'
                      AND timestamp >= $3
                      AND timestamp < $2
                      AND user_id IN (
                          SELECT id
                          FROM users
                          WHERE business_partner_id = $4
                      )
                `, queryParams),

                client.query(`
                    SELECT
                        COUNT(*) FILTER (
                            WHERE ${readTimestampColumn} >= $1
                              AND ${readTimestampColumn} < $2
                        )::int AS current_reads,

                        COUNT(*) FILTER (
                            WHERE ${readTimestampColumn} >= $3
                              AND ${readTimestampColumn} < $1
                        )::int AS prev_reads
                    FROM user_read_scraped_content
                    WHERE ${readTimestampColumn} >= $3
                      AND ${readTimestampColumn} < $2
                      AND user_id IN (
                          SELECT id
                          FROM users
                          WHERE business_partner_id = $4
                      )
                `, queryParams),

                client.query(`
                    SELECT
                        COUNT(*) FILTER (
                            WHERE created_at >= $1
                              AND created_at < $2
                        )::int AS current_posts,

                        COUNT(*) FILTER (
                            WHERE created_at >= $3
                              AND created_at < $1
                        )::int AS prev_posts
                    FROM community_posts
                    WHERE business_partner_id = $4
                      AND created_at >= $3
                      AND created_at < $2
                `, queryParams),

                client.query(`
                    SELECT
                        COUNT(*) FILTER (
                            WHERE timestamp >= $1
                              AND timestamp < $2
                        )::int AS current_downloads,

                        COUNT(*) FILTER (
                            WHERE timestamp >= $3
                              AND timestamp < $1
                        )::int AS prev_downloads
                    FROM activity_log
                    WHERE action_type = 'FILE_DOWNLOAD'
                      AND timestamp >= $3
                      AND timestamp < $2
                      AND user_id IN (
                          SELECT id
                          FROM users
                          WHERE business_partner_id = $4
                      )
                `, queryParams)
            ]);

            const storageLimit = Math.max(0, Number(
                partner.storage_limit_bytes || 0
            ));

            const storageUsed = Math.max(0, Number(
                partner.storage_usage_bytes || 0
            ));

            const storagePercent = storageLimit > 0
                ? Math.round((storageUsed / storageLimit) * 100)
                : 0;

            const stats = {
                monthName: lastMonthStart.toLocaleString('de-AT', {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'Europe/Vienna'
                }),

                logins: {
                    current: Number(
                        loginsRes.rows[0]?.current_logins || 0
                    ),
                    prev: Number(
                        loginsRes.rows[0]?.prev_logins || 0
                    )
                },

                reads: {
                    current: Number(
                        readsRes.rows[0]?.current_reads || 0
                    ),
                    prev: Number(
                        readsRes.rows[0]?.prev_reads || 0
                    )
                },

                community: {
                    current: Number(
                        communityRes.rows[0]?.current_posts || 0
                    ),
                    prev: Number(
                        communityRes.rows[0]?.prev_posts || 0
                    )
                },

                downloads: {
                    current: Number(
                        downloadsRes.rows[0]?.current_downloads || 0
                    ),
                    prev: Number(
                        downloadsRes.rows[0]?.prev_downloads || 0
                    )
                },

                storage: {
                    percent: storagePercent,
                    usedMb: (
                        storageUsed /
                        1024 /
                        1024
                    ).toFixed(1),
                    limitMb: (
                        storageLimit /
                        1024 /
                        1024
                    ).toFixed(1)
                }
            };

            console.log(
                `[Reporting] Kennzahlen für "${partner.name}":`,
                stats
            );

            if (collectPreviewDetails) {
                previews.push({
                    partner: {
                        id: partner.id,
                        name: partner.name,
                        allowAutomatedNewsletter: Boolean(partner.allow_automated_newsletter),
                    },
                    subject: `Ihre monatliche Plattform-Auswertung: ${stats.monthName}`,
                    reportMonth,
                    period: {
                        reportFrom: lastMonthStart.toISOString(),
                        reportToExclusive: currentMonthStart.toISOString(),
                        comparisonFrom: prevMonthStart.toISOString(),
                        comparisonToExclusive: lastMonthStart.toISOString(),
                    },
                    stats,
                    recipients: recipients.map((recipient) => ({
                        id: recipient.id,
                        email: recipient.email,
                        firstName: recipient.first_name || '',
                        lastName: recipient.last_name || '',
                        role: recipient.role,
                    })),
                });
            }

            for (const user of recipients) {
                if (dryRun) {
                    const previewHtml = renderMonthlyPartnerReportEmail({ stats, partner, user });
                    if (!previewHtml) {
                        failedCount++;
                    } else {
                        plannedCount++;
                    }
                    continue;
                }

                const { rows: deliveryClaims } = await client.query(`
                    INSERT INTO monthly_report_deliveries (
                        business_partner_id,
                        user_id,
                        report_month,
                        status
                    )
                    VALUES ($1, $2, $3, 'sending')
                    ON CONFLICT (business_partner_id, user_id, report_month) DO UPDATE
                    SET status = 'sending',
                        created_at = CURRENT_TIMESTAMP,
                        sent_at = NULL,
                        failed_at = NULL,
                        error_message = NULL
                    WHERE monthly_report_deliveries.status = 'failed'
                       OR (
                            monthly_report_deliveries.status = 'sending'
                            AND monthly_report_deliveries.created_at < CURRENT_TIMESTAMP - INTERVAL '2 hours'
                       )
                    RETURNING id
                `, [partner.id, user.id, reportMonth]);

                if (deliveryClaims.length === 0) {
                    skippedAlreadySentCount++;
                    console.log(`[Reporting] Monatsreport für ${user.email} wurde bereits verarbeitet.`);
                    continue;
                }

                const deliveryId = deliveryClaims[0].id;
                const htmlContent = renderMonthlyPartnerReportEmail({
                    stats,
                    partner,
                    user
                });

                if (!htmlContent) {
                    failedCount++;
                    await client.query(`
                        UPDATE monthly_report_deliveries
                        SET status = 'failed',
                            failed_at = CURRENT_TIMESTAMP,
                            error_message = 'Das E-Mail-Template lieferte keinen Inhalt.'
                        WHERE id = $1
                    `, [deliveryId]);
                    console.error(`[Reporting] Das E-Mail-Template lieferte keinen Inhalt für ${user.email}.`);
                    continue;
                }

                try {
                    await sendEmail({
                        to: user.email,
                        subject:
                            `Ihre monatliche Plattform-Auswertung: ${stats.monthName}`,
                        html: htmlContent,
                        fromName: 'Dashboard Insights'
                    });

                    await client.query(`
                        UPDATE monthly_report_deliveries
                        SET status = 'sent',
                            sent_at = CURRENT_TIMESTAMP,
                            failed_at = NULL,
                            error_message = NULL
                        WHERE id = $1
                    `, [deliveryId]);

                    sentCount++;
                    console.log(`[Reporting] Monatsreport erfolgreich an ${user.email} versendet.`);
                } catch (sendError) {
                    failedCount++;
                    const sendErrorMessage = String(sendError?.message || 'Unbekannter Versandfehler').slice(0, 1000);
                    await client.query(`
                        UPDATE monthly_report_deliveries
                        SET status = 'failed',
                            failed_at = CURRENT_TIMESTAMP,
                            error_message = $2
                        WHERE id = $1
                    `, [deliveryId, sendErrorMessage]);
                    console.error(`[Reporting] Monatsreport an ${user.email} fehlgeschlagen:`, sendError.message);
                }
            }
        }

        console.log(
            '[Reporting] Monatliche Mandanten-Reports erfolgreich verarbeitet.',
            {
                sentCount,
                plannedCount,
                skippedPartnerCount,
                skippedAlreadySentCount,
                failedCount,
                dryRun,
                includeUnsubscribedRecipients
            }
        );

        if (failedCount > 0) {
            throw new Error(`${failedCount} Monatsreport(s) konnten nicht versendet werden.`);
        }

        return {
            ok: true,
            sentCount,
            plannedCount,
            skippedPartnerCount,
            skippedAlreadySentCount,
            failedCount,
            dryRun,
            includeUnsubscribedRecipients,
            previews
        };

    } catch (err) {
        console.error(
            '[Reporting] Fehler beim Monats-Report:',
            err?.stack || err?.message || err
        );

        throw err;
    } finally {
        client.release();
    }
};
