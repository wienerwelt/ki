// backend/services/reportingService.js

const db = require('../config/db');
const { sendEmail } = require('./emailService');
const { renderBriefingEmail } = require('./emailTemplates');

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
        )
    ];

    const results = await Promise.all(queries);

    const activityLogTokens = Number(results[3].rows[0].total || 0);
    const usageLogTokens = Number(results[4].rows[0].total || 0);

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
        scrapingJobsCompleted: results[6].rows[0].count
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
                    <td style="padding:10px; border:1px solid #ddd;">Datei-Uploads</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.fileUploads}</strong></td>
                </tr>

                <tr style="background:#f9f9f9;">
                    <td style="padding:10px; border:1px solid #ddd;">AI Tokens (Activity Log)</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.tokensActivityLog}</strong></td>
                </tr>

                <tr>
                    <td style="padding:10px; border:1px solid #ddd;">AI Tokens (Usage Logs)</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.tokensUsageLogs}</strong></td>
                </tr>

                <tr style="background:#f2f2f2;">
                    <td style="padding:10px; border:1px solid #ddd;"><strong>AI Tokens gesamt</strong></td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.tokensTotal}</strong></td>
                </tr>

                <tr>
                    <td style="padding:10px; border:1px solid #ddd;">Gescrapte Inhalte</td>
                    <td style="padding:10px; border:1px solid #ddd;"><strong>${stats.scrapedContents}</strong></td>
                </tr>

                <tr style="background:#f9f9f9;">
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

/**
 * Öffentliche Funktion für Cron / Scheduler
 */
exports.generateAndSendDailyReport = async () => {
    try {
        const stats = await getDailyStats();
        const htmlContent = formatReportAsHtml(stats);

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
 * EXISTIEREND: Briefing Newsletter (unverändert)
 */
exports.generateAndSendBriefingNewsletters = async () => {
    const client = await db.connect();
    try {
        const { rows: partners } = await client.query(
            `SELECT id, name, dashboard_title, logo_url
             FROM business_partners
             WHERE is_active = TRUE`
        );

        for (const partner of partners) {
            const { rows: subscribers } = await client.query(
                `SELECT email
                 FROM users
                 WHERE business_partner_id = $1
                   AND newsletter_opt_in = TRUE
                   AND is_active = TRUE`,
                [partner.id]
            );

            if (subscribers.length === 0) continue;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const briefingRes = await client.query(
                `SELECT *
                 FROM business_partner_intelligence_briefings
                 WHERE business_partner_id = $1
                   AND created_at >= $2
                 ORDER BY briefing_type ASC`,
                [partner.id, today]
            );

            if (briefingRes.rows.length === 0) continue;

            const briefingData = {
                market_briefing: briefingRes.rows.find(r => r.briefing_type === 'market'),
                sales_triggers: briefingRes.rows.filter(r => r.briefing_type === 'account_specific')
            };

            const html = renderBriefingEmail({
                briefing: briefingData,
                brandLogoUrl: partner.logo_url
            });

            const subject = `Ihr Tägliches Briefing: ${
                briefingData.market_briefing?.headline ||
                new Date().toLocaleDateString('de-DE')
            }`;

            await sendEmail({
                to: subscribers.map(s => s.email),
                subject,
                html,
                fromName: partner.dashboard_title || 'Ihr KI-Dashboard'
            });
        }
    } catch (err) {
        console.error('[Reporting] Fehler beim Versand der Briefing-Newsletter:', err);
    } finally {
        client.release();
    }
};
