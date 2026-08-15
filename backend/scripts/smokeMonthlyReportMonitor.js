const jwt = require('jsonwebtoken');
const db = require('../config/db');

const main = async () => {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET fehlt.');

    const { rows } = await db.query(`
        SELECT id, role, business_partner_id
        FROM users
        WHERE role = 'admin'
          AND business_partner_id IS NOT NULL
          AND is_active = TRUE
        ORDER BY created_at ASC
        LIMIT 1
    `);
    const user = rows[0];
    if (!user) throw new Error('Kein aktiver Admin mit Business Partner für den Smoke-Test vorhanden.');

    const token = jwt.sign({
        id: user.id,
        role: user.role,
        business_partner_id: user.business_partner_id,
    }, process.env.JWT_SECRET, { expiresIn: '2m' });

    const baseUrl = process.env.SMOKE_API_URL || 'http://127.0.0.1:5000';
    const response = await fetch(`${baseUrl}/api/admin/monitor/monthly-report-deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();

    const configResponse = await fetch(`${baseUrl}/api/data/dashboard/config`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const configBody = await configResponse.json();

    if (!response.ok) throw new Error(body?.message || `HTTP ${response.status}`);
    if (!configResponse.ok) throw new Error(configBody?.message || `Dashboard-Konfiguration: HTTP ${configResponse.status}`);
    if (body?.settings?.id !== user.business_partner_id) {
        throw new Error('Monitoring-Antwort ist nicht auf den angemeldeten Business Partner begrenzt.');
    }
    if (!body.totals || !Array.isArray(body.monthly) || !Array.isArray(body.deliveries)) {
        throw new Error('Monitoring-Antwort hat ein ungültiges Format.');
    }
    if (!configBody?.businessPartner?.slug) {
        throw new Error('Dashboard-Konfiguration enthält keinen Mandanten-Slug für den Logout.');
    }

    console.log(JSON.stringify({
        ok: true,
        status: response.status,
        partner: body.settings.name,
        partnerSlug: configBody.businessPartner.slug,
        eligibleRecipients: body.settings.eligible_recipients,
        totals: body.totals,
        deliveryCount: body.deliveries.length,
    }, null, 2));
};

main()
    .catch((error) => {
        console.error('[smoke:monthly-report-monitor]', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
