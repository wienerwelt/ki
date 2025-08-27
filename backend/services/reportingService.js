// backend/services/reportingService.js
const db = require('../config/db');
const { sendEmail } = require('./emailService');

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