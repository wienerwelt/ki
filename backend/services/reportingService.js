// backend/services/reportingService.js
const db = require('../config/db');
const { sendEmail } = require('./emailService');
const { renderBriefingEmail } = require('./emailTemplates');

// Function to get daily statistics from the database
async function getDailyStats() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const queries = [
        db.query("SELECT COUNT(*) FROM users WHERE created_at >= $1", [yesterday]),
        db.query("SELECT COUNT(*) FROM activity_log WHERE action_type = 'LOGIN' AND status = 'success' AND timestamp >= $1", [yesterday]),
        db.query("SELECT COUNT(*) FROM business_partner_files WHERE created_at >= $1", [yesterday]),
        db.query("SELECT SUM(total_tokens) as total FROM ai_usage_logs WHERE created_at >= $1", [yesterday]),
        db.query("SELECT COUNT(*) FROM scraping_jobs WHERE status = 'completed' AND completed_at >= $1", [yesterday])
    ];
    const results = await Promise.all(queries);
    return {
        newUsers: results[0].rows[0].count || '0',
        successfulLogins: results[1].rows[0].count || '0',
        fileUploads: results[2].rows[0].count || '0',
        aiTokensUsed: results[3].rows[0].total || '0',
        scrapingJobsCompleted: results[4].rows[0].count || '0',
    };
}

// Function to format the report as an HTML email
function formatReportAsHtml(stats) {
    const reportDate = new Date().toLocaleDateString('de-AT', { dateStyle: 'full' });
    return `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h1>Dashboard Tagesreport</h1>
            <p><strong>Datum:</strong> ${reportDate}</p>
            <hr>
            <h2>Aktivitäten der letzten 24 Stunden:</h2>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <tr style="background-color: #f2f2f2;"><th style="padding: 12px; border: 1px solid #ddd;">Metrik</th><th style="padding: 12px; border: 1px solid #ddd;">Wert</th></tr>
                <tr><td style="padding: 12px; border: 1px solid #ddd;">Neue Benutzer</td><td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">${stats.newUsers}</td></tr>
                <tr style="background-color: #f2f2f2;"><td style="padding: 12px; border: 1px solid #ddd;">Erfolgreiche Logins</td><td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">${stats.successfulLogins}</td></tr>
                <tr><td style="padding: 12px; border: 1px solid #ddd;">Datei-Uploads</td><td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">${stats.fileUploads}</td></tr>
                <tr style="background-color: #f2f2f2;"><td style="padding: 12px; border: 1px solid #ddd;">Verbrauchte AI-Tokens</td><td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">${stats.aiTokensUsed}</td></tr>
                <tr><td style="padding: 12px; border: 1px solid #ddd;">Abgeschlossene Scraping-Jobs</td><td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">${stats.scrapingJobsCompleted}</td></tr>
            </table>
            <p style="margin-top: 20px; font-size: 12px; color: #888;">Dies ist eine automatisch generierte E-Mail.</p>
        </div>
    `;
}


async function generateAndSendBriefingNewsletters() {
    console.log('[Reporting] Starte Versand der täglichen Briefing-Newsletter...');
    const client = await db.connect();
    try {
        const { rows: partners } = await client.query(
            `SELECT id, name, dashboard_title, logo_url FROM business_partners WHERE is_active = TRUE`
        );

        for (const partner of partners) {
            const { rows: subscribers } = await client.query(
                `SELECT email FROM users WHERE business_partner_id = $1 AND newsletter_opt_in = TRUE AND is_active = TRUE`,
                [partner.id]
            );

            if (subscribers.length === 0) {
                console.log(`[Reporting] Kein Newsletter-Abonnent für Partner "${partner.name}". Überspringe.`);
                continue;
            }

            // Hole die Briefing-Daten für diesen Partner
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const briefingRes = await client.query(
                `SELECT * FROM business_partner_intelligence_briefings 
                 WHERE business_partner_id = $1 AND created_at >= $2 
                 ORDER BY briefing_type ASC`, // 'market' kommt zuerst
                [partner.id, today]
            );

            if (briefingRes.rows.length === 0) {
                console.log(`[Reporting] Kein heutiges Briefing für Partner "${partner.name}" gefunden. Überspringe.`);
                continue;
            }

            // Strukturiere die Daten für die E-Mail-Vorlage
            const briefingData = {
                market_briefing: briefingRes.rows.find(r => r.briefing_type === 'market'),
                sales_triggers: briefingRes.rows.filter(r => r.briefing_type === 'account_specific')
            };

            const html = renderBriefingEmail({ briefing: briefingData, brandLogoUrl: partner.logo_url });
            const subject = `Ihr Tägliches Briefing: ${briefingData.market_briefing?.headline || new Date().toLocaleDateString('de-DE')}`;
            const recipientEmails = subscribers.map(s => s.email);

            await sendEmail({
                to: recipientEmails,
                subject: subject,
                html: html,
                fromName: partner.dashboard_title || 'Ihr KI-Dashboard'
            });
            console.log(`[Reporting] Briefing an ${recipientEmails.length} Empfänger für "${partner.name}" versendet.`);
        }
    } catch (err) {
        console.error('[Reporting] Fehler beim Erstellen und Senden der Briefing-Newsletter:', err);
    } finally {
        client.release();
    }
}

// Main function to be called by the controller
exports.generateAndSendDailyReport = async () => {
    try {
        const stats = await getDailyStats();
        const htmlContent = formatReportAsHtml(stats);
        await sendEmail({
            to: process.env.EMAIL_ADMIN,
            subject: `Täglicher Dashboard-Report - ${new Date().toLocaleDateString('de-AT')}`,
            html: htmlContent,
            fromName: "Dashboard Admin"
        });
        console.log('Täglicher Admin-Report erfolgreich versendet.');
    } catch (error) {
        console.error('Fehler beim Senden des täglichen Admin-Reports:', error);
    }
};

exports.generateAndSendBriefingNewsletters = generateAndSendBriefingNewsletters;