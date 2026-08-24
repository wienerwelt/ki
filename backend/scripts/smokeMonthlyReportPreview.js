const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { generateAndSendMonthlyReport } = require('../services/reportingService');
const queueService = require('../services/queueService');

async function closeResources() {
    await Promise.allSettled([
        queueService.aiContentQueue.close(),
        queueService.scrapeQueue.close(),
        queueService.emailQueue.close(),
        queueService.dataUpdatesQueue.close(),
        queueService.fundingQueue.close(),
    ]);
    queueService.connection.disconnect();
    queueService.heartbeatRedisClient.disconnect();
    await db.end();
}

async function run() {
    const { rows } = await db.query(`
        SELECT
            u.id AS user_id,
            u.username,
            u.auth_version,
            u.business_partner_id,
            bp.name AS partner_name
        FROM users u
        JOIN business_partners bp ON bp.id = u.business_partner_id
        WHERE u.role = 'admin'
          AND u.is_active = TRUE
          AND bp.is_active = TRUE
        ORDER BY bp.name ASC, u.username ASC
        LIMIT 1
    `);
    const admin = rows[0];
    if (!admin) throw new Error('Kein aktiver Admin mit Mandant für den Vorschautest vorhanden.');

    const result = await generateAndSendMonthlyReport({
        dryRun: true,
        targetBusinessPartnerId: admin.business_partner_id,
        includeUnsubscribedRecipients: false,
        collectPreviewDetails: true,
    });
    const preview = result.previews?.[0];

    if (!result.dryRun || result.sentCount !== 0) {
        throw new Error('Die Vorschau darf keine E-Mail versenden.');
    }
    if (!preview || preview.partner.id !== admin.business_partner_id) {
        throw new Error('Die Vorschau ist nicht auf den ausgewählten Mandanten begrenzt.');
    }
    if (!preview.period?.reportFrom || !preview.period?.reportToExclusive || !preview.stats) {
        throw new Error('Zeitraum oder Kennzahlen fehlen in der Vorschau.');
    }
    if (preview.recipients.some((recipient) => !['admin', 'assistenz'].includes(recipient.role))) {
        throw new Error('Die Vorschau enthält eine nicht erlaubte Empfängerrolle.');
    }

    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET fehlt für den Routentest.');
    const token = jwt.sign({
        sub: admin.user_id,
        username: admin.username,
        role: 'admin',
        business_partner_id: admin.business_partner_id,
        av: Number(admin.auth_version || 0),
    }, process.env.JWT_SECRET, { expiresIn: '2m', algorithm: 'HS256' });
    const baseUrl = process.env.SMOKE_API_URL || 'http://127.0.0.1:5000';
    const routeResponse = await fetch(`${baseUrl}/api/admin/monitor/monthly-report-preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    const routeBody = await routeResponse.json();
    if (!routeResponse.ok) {
        throw new Error(routeBody?.message || `Vorschau-Route: HTTP ${routeResponse.status}`);
    }
    if (routeBody?.partner?.id !== admin.business_partner_id || routeBody?.sendsEmails !== false) {
        throw new Error('Die Vorschau-Route liefert keinen sicheren mandantenspezifischen Dry-Run.');
    }

    console.log(JSON.stringify({
        ok: true,
        partner: preview.partner.name,
        reportMonth: preview.reportMonth,
        recipientCount: preview.recipients.length,
        routeStatus: routeResponse.status,
        sendsEmails: false,
    }, null, 2));
}

run()
    .catch((error) => {
        console.error('[smoke:monthly-report-preview] fehlgeschlagen:', error.message);
        process.exitCode = 1;
    })
    .finally(closeResources);
