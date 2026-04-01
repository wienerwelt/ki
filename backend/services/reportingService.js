// backend/services/reportingService.js

const db = require('../config/db');
const { sendEmail, sendDailyBriefing } = require('./emailService');
// Optional: falls du renderBriefingEmail hier noch benötigst
// const { renderBriefingEmail } = require('./emailTemplates');
const { connection: redisClient, heartbeatRedisClient } = require('./queueService');

/**
 * =========================
 * ADMIN – DAILY MAIL REPORT
 * Zeitraum: rolling last 24h
 * KPI harmonisiert mit AdminStatistics
 * =========================
 */

async function getDailyStats() {
    // rolling 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const queries = [
        // 1) Neue User
        db.query(
            `SELECT COUNT(*)::int AS count
             FROM users
             WHERE created_at >= $1`,
            [since]
        ),

        // 2) Erfolgreiche Logins (harmonisiert)
        db.query(
            `SELECT COUNT(*)::int AS count
             FROM activity_log
             WHERE action_type = 'LOGIN_SUCCESS'
               AND status = 'success'
               AND timestamp >= $1`,
            [since]
        ),

        // 3) Datei-Uploads
        db.query(
            `SELECT COUNT(*)::int AS count
             FROM business_partner_files
             WHERE created_at >= $1`,
            [since]
        ),

        // 4) Tokens aus activity_log (Redactional / UI / Analysis)
        db.query(
            `SELECT COALESCE(SUM(
                (details->'tokenUsage'->>'totalTokens')::int
            ), 0) AS total
             FROM activity_log
             WHERE action_type LIKE 'AI_%_SUCCESS'
               AND timestamp >= $1`,
            [since]
        ),

        // 5) Tokens aus ai_usage_logs (Jobs / Funding / Background)
        db.query(
            `SELECT COALESCE(SUM(total_tokens), 0) AS total
             FROM ai_usage_logs
             WHERE created_at >= $1`,
            [since]
        ),

        // 6) Gescrapte Inhalte (Rows)
        db.query(
            `SELECT COUNT(*)::int AS count
             FROM scraped_content
             WHERE scraped_at >= $1`,
            [since]
        ),

        // 7) Abgeschlossene Scraping-Jobs
        db.query(
            `SELECT COUNT(*)::int AS count
             FROM scraping_jobs
             WHERE status = 'completed'
               AND completed_at >= $1`,
            [since]
        ),
        
        // 8) S3 Speicher Gesamt (aus der Datenbank)
        db.query(
            `SELECT COUNT(*)::int AS count, 
                    COALESCE(SUM(file_size), 0) AS total_bytes 
             FROM business_partner_files`
        )
    ];

    const results = await Promise.all(queries);

    const activityLogTokens = Number(results[3].rows[0].total || 0);
    const usageLogTokens = Number(results[4].rows[0].total || 0);
    
    const totalBytes = Number(results[7].rows[0].total_bytes || 0);
    const s3StorageMb = (totalBytes / (1024 * 1024)).toFixed(2);

    return {
        timeframe: {
            start: since.toISOString(),
            end: new Date().toISOString()
        },
        newUsers: results[0].rows[0].count,
        successfulLogins: results[1].rows[0].count,
        fileUploads: results[2].rows[0].count,
        tokensActivityLog: activityLogTokens,
        tokensUsageLogs: usageLogTokens,
        tokensTotal: activityLogTokens + usageLogTokens,
        scrapedContents: results[5].rows[0].count,
        scrapingJobsCompleted: results[6].rows[0].count,
        s3TotalFiles: results[7].rows[0].count,
        s3StorageMb: s3StorageMb
    };
}

/**
 * HTML-Aufbereitung für Admin-Mail
 */
function formatReportAsHtml(stats) {
    const start = new Date(stats.timeframe.start).toLocaleString('de-AT');
    const end = new Date(stats.timeframe.end).toLocaleString('de-AT');

    return `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h1>Dashboard – Admin Tagesreport</h1>
            <p>
                <strong>Zeitraum:</strong><br/>
                ${start} – ${end} (letzte 24h)
            </p>
            <hr/>

            <table style="width:100%; border-collapse: collapse;">
                <tr style="background:#f2f2f2;">
                    <th style="padding:10px; border:1px solid #ddd;">KPI</th>
                    <th style="padding:10px; border:1px solid #ddd;">Wert</th>
                </tr>

                <tr>
                    <td style="padding:10px; border:1px solid #ddd;">Neue Benutzer</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.newUsers}</strong></td>
                </tr>

                <tr style="background:#f9f9f9;">
                    <td style="padding:10px; border:1px solid #ddd;">Erfolgreiche Logins</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.successfulLogins}</strong></td>
                </tr>

                <tr>
                    <td style="padding:10px; border:1px solid #ddd;">Datei-Uploads (24h)</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.fileUploads}</strong></td>
                </tr>
                
                <tr style="background:#f9f9f9;">
                    <td style="padding:10px; border:1px solid #ddd; color: #1976d2;"><strong>S3 Speicher Gesamt</strong></td>
                    <td style="padding:10px; border:1px solid #ddd; color: #1976d2;"><strong>${stats.s3StorageMb} MB (${stats.s3TotalFiles} Dateien)</strong></td>
                </tr>

                <tr>
                    <td style="padding:10px; border:1px solid #ddd;">AI Tokens (Activity Log)</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.tokensActivityLog}</strong></td>
                </tr>

                <tr style="background:#f9f9f9;">
                    <td style="padding:10px; border:1px solid #ddd;">AI Tokens (Usage Logs)</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.tokensUsageLogs}</strong></td>
                </tr>

                <tr>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>AI Tokens gesamt</strong></td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.tokensTotal}</strong></td>
                </tr>

                <tr style="background:#f9f9f9;">
                    <td style="padding:10px; border:1px solid #ddd;">Gescrapte Inhalte</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.scrapedContents}</strong></td>
                </tr>

                <tr>
                    <td style="padding:10px; border:1px solid #ddd;">Abgeschlossene Scraping-Jobs</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.scrapingJobsCompleted}</strong></td>
                </tr>
            </table>

            <p style="margin-top:20px; font-size:12px; color:#888;">
                Automatisch generierter Report – rolling 24h.
            </p>
        </div>
    `;
}

exports.generateAndSendDailyReport = async () => {
    try {
        const stats = await getDailyStats();
        let htmlContent = formatReportAsHtml(stats);

        const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        htmlContent += `
            <p style="margin-top: 20px;">
                <a href="${dashboardUrl}/admin/monitor" style="padding: 10px 15px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; display: inline-block;">
                    Zum Admin-Dashboard
                </a>
            </p>
        `;

        await sendEmail({
            to: process.env.EMAIL_ADMIN,
            subject: `Admin Report – letzte 24h`,
            html: htmlContent,
            fromName: 'Dashboard Admin'
        });

        console.log('[Reporting] Admin Daily Report erfolgreich versendet.');
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

function isPartnerDueToday(frequency) {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sonntag, 5 = Freitag
    const dateOfMonth = today.getDate();

    switch (frequency) {
        case 'daily': return true;
        case 'weekly': return dayOfWeek === 5; // Jeden Freitag
        case 'biweekly': 
            // Jeden zweiten Freitag (gerade Kalenderwoche)
            const weekNumber = Math.ceil((((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7);
            return dayOfWeek === 5 && weekNumber % 2 === 0;
        case 'monthly': return dateOfMonth === 1; // Am 1. des Monats
        case 'never':
        default: return false;
    }
}

exports.generateAndSendBriefingNewsletters = async () => {
    console.log('[mail] Starte automatischen Briefing-Versand (Auto-Publishing)...');
    const client = await db.connect();

    try {
        const { rows: partners } = await client.query(`
            SELECT bp.*, row_to_json(cs.*) as color_scheme 
            FROM business_partners bp
            LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
            WHERE bp.is_active = TRUE AND bp.briefing_frequency != 'never'
        `);

        for (const partner of partners) {
            if (!isPartnerDueToday(partner.briefing_frequency)) continue;

            console.log(`[mail] Verarbeite Versand für ${partner.name} (${partner.briefing_frequency})...`);

            const { rows: items } = await client.query(`
                SELECT * FROM business_partner_intelligence_briefings
                WHERE business_partner_id = $1 
                AND DATE(created_at) = CURRENT_DATE
                AND status IN ('draft', 'published')
                ORDER BY id ASC
            `, [partner.id]);

            if (items.length === 0) {
                console.log(`[mail] Keine Inhalte für ${partner.name} gefunden. Überspringe.`);
                continue;
            }

            const briefing = {
                top_insights: items.filter(i => i.briefing_type === 'top_insight').map(i => ({
                    title: i.headline,
                    what_changed: i.analysis_summary,
                    so_what: i.prognosis,
                    action: i.talking_point,
                    sources: i.related_articles ? JSON.parse(i.related_articles) : []
                })),
                regulation_and_funding: items.filter(i => i.briefing_type === 'regulation').map(i => ({
                    title: i.headline,
                    summary: i.analysis_summary,
                    action: i.talking_point
                })),
                recommended_actions: items.filter(i => i.briefing_type === 'action_plan').map(i => i.headline)
            };

            const { rows: recipients } = await client.query(`
                SELECT email, first_name, last_name FROM users 
                WHERE business_partner_id = $1 AND newsletter_opt_in = TRUE AND is_active = TRUE
            `, [partner.id]);

            if (recipients.length > 0) {
                for (const user of recipients) {
                    try {
                        await sendDailyBriefing({ to: user.email, user, partner, briefing });
                    } catch (err) {
                        console.error(`[mail] Fehler beim Senden an ${user.email}:`, err.message);
                    }
                }
                
                await client.query(`
                    UPDATE business_partner_intelligence_briefings 
                    SET status = 'published' 
                    WHERE business_partner_id = $1 AND DATE(created_at) = CURRENT_DATE
                `, [partner.id]);

                console.log(`[mail] ${recipients.length} Mails für ${partner.name} versendet.`);
            }
        }
    } catch (err) {
        console.error('[mail] Kritischer Fehler beim Briefing-Versand:', err);
    } finally {
        client.release();
    }
};