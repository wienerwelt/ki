const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const db = require('../config/db');
const { getMonthlyReportPeriod } = require('../utils/monthlyReportPeriod');

function stubModule(modulePath, exports) {
    const id = require.resolve(modulePath);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}

// Isolated transaction; all fixtures and delivery records are rolled back.
// The actual email transport and queues are replaced before loading services.
async function run() {
    const autumn = getMonthlyReportPeriod(new Date('2026-11-01T01:00:00Z'));
    assert.equal(autumn.reportMonth, '2026-10-01');
    assert.equal(autumn.lastMonthStart.toISOString(), '2026-09-30T22:00:00.000Z');
    assert.equal(autumn.currentMonthStart.toISOString(), '2026-10-31T23:00:00.000Z');
    const spring = getMonthlyReportPeriod(new Date('2026-03-31T22:00:00Z'));
    assert.equal(spring.reportMonth, '2026-03-01');
    assert.equal(spring.lastMonthStart.toISOString(), '2026-02-28T23:00:00.000Z');
    assert.equal(spring.currentMonthStart.toISOString(), '2026-03-31T22:00:00.000Z');
    assert.equal(getMonthlyReportPeriod(new Date('2025-12-31T23:00:00Z')).reportMonth, '2025-12-01');

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const testDb = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release() {} }) };
        stubModule('../config/db', testDb);
        stubModule('../services/queueService', { connection: {}, heartbeatRedisClient: {} });
        stubModule('../services/auditLogService', { logActivity: async () => {} });
        let simulatedSends = 0;
        stubModule('../services/emailService', {
            sendEmail: async ({ to, partner }) => {
                assert.match(to, /@example\.invalid$/);
                assert.ok(partner?.id, 'Report must forward tenant branding to the mail service');
                simulatedSends++;
                return { messageId: 'simulated', accepted: [to], rejected: [] };
            },
        });
        const { generateAndSendMonthlyReport } = require('../services/reportingService');
        const { loadEligibleRecipients } = require('../services/memberNewsletterService');
        const { dispatchBriefing } = require('../services/newsletterDeliveryService');
        const adminController = require('../controllers/adminUserController');
        const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
        const partnerResult = await client.query(`
            INSERT INTO business_partners (name, slug, is_active, monthly_report_enabled, allow_automated_newsletter)
            VALUES ($1, $2, TRUE, TRUE, FALSE) RETURNING id`, [`Report smoke ${suffix}`, `report-smoke-${suffix}`]);
        const partnerId = partnerResult.rows[0].id;
        const createUser = async (name, role, overrides = {}) => {
            const row = await client.query(`
                INSERT INTO users (username, email, password_hash, role, business_partner_id, is_active,
                    newsletter_opt_in, newsletter_opt_in_confirmed_at, newsletter_email_enabled,
                    member_newsletter_enabled, briefing_email_enabled, monthly_report_email_enabled, active_until)
                VALUES ($1, $2, 'not-a-real-password', $3, $4, $5, $6, $7, $8, TRUE, TRUE, $9, $10) RETURNING *`,
                [`report-${name}-${suffix}`, `report-${name}-${suffix}@example.invalid`, role, partnerId,
                    overrides.active ?? true, overrides.consent ?? false, overrides.consent ? new Date() : null,
                    overrides.newsletter ?? false, overrides.monthly ?? true, overrides.until ?? null]);
            return row.rows[0];
        };
        const assistant = await createUser('assistant', 'assistenz');
        await createUser('inactive', 'assistenz', { active: false });
        await createUser('expired', 'assistenz', { until: '2000-01-01' });
        await createUser('disabled', 'admin', { monthly: false });
        const member = await createUser('member', 'user', { consent: true });
        const foreign = await client.query(`SELECT id FROM business_partners WHERE id <> $1 LIMIT 1`, [partnerId]);
        assert.ok(foreign.rows[0], 'A second tenant is required to test isolation');
        await client.query(`INSERT INTO users (username, email, password_hash, role, business_partner_id, monthly_report_email_enabled)
            VALUES ($1, $2, 'test', 'assistenz', $3, TRUE)`, [`foreign-${suffix}`, `foreign-${suffix}@example.invalid`, foreign.rows[0].id]);

        const preview = await generateAndSendMonthlyReport({ dryRun: true, collectPreviewDetails: true, targetBusinessPartnerId: partnerId });
        assert.equal(preview.sentCount, 0);
        assert.deepEqual(preview.previews[0].recipients.map((row) => row.id), [assistant.id]);
        assert.equal(preview.previews[0].partner.monthlyReportEnabled, true);
        assert.equal(preview.previews[0].partner.allowAutomatedNewsletter, false);
        assert.equal(preview.previews[0].stats.participation.percent, 0);
        const period = getMonthlyReportPeriod();
        const loggedAt = new Date(period.lastMonthStart.getTime() + 60 * 60 * 1000);
        for (let i = 0; i < 2; i++) {
            await client.query(`INSERT INTO activity_log (user_id, username, action_type, status, timestamp)
                VALUES ($1, $2, 'LOGIN_SUCCESS', 'success', $3)`, [assistant.id, assistant.username, loggedAt]);
        }
        const activePreview = await generateAndSendMonthlyReport({ dryRun: true, collectPreviewDetails: true, targetBusinessPartnerId: partnerId });
        assert.equal(activePreview.previews[0].stats.logins.current, 2);
        assert.equal(activePreview.previews[0].stats.activeUsers.current, 1);
        assert.equal(activePreview.previews[0].stats.participation.participatingAccounts, 1);
        assert.equal(activePreview.previews[0].stats.participation.percent, 33);

        assert.equal((await loadEligibleRecipients(partnerId)).length, 0, 'Admin-paused members must be excluded');
        assert.equal((await dispatchBriefing({ partner: { id: partnerId, newsletter_delivery_mode: 'mobiliti' }, items: [], briefing: {}, frequency: 'daily' })).recipientCount, 0);

        const invokeUpdate = async (requesterRole, body) => {
            const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
            await adminController.updateUser({ params: { id: member.id }, user: { id: assistant.id, role: requesterRole, business_partner_id: partnerId },
                body: { ...member, ...body }, ip: '127.0.0.1' }, res);
            return res;
        };
        assert.equal((await invokeUpdate('assistenz', { newsletter_email_enabled: true })).statusCode, 403);
        assert.equal((await invokeUpdate('admin', { newsletter_email_enabled: 'true' })).statusCode, 400);
        assert.equal((await invokeUpdate('admin', { monthly_report_email_enabled: true })).statusCode, 400);
        // Avoid privileged fields from the fixture row; admin only changes the delivery switch.
        assert.equal((await invokeUpdate('admin', { newsletter_email_enabled: true, monthly_report_email_enabled: false })).statusCode, 200);
        const afterEnable = (await client.query('SELECT * FROM users WHERE id = $1', [member.id])).rows[0];
        assert.equal(afterEnable.newsletter_opt_in, true);
        assert.equal(afterEnable.newsletter_opt_in_confirmed_at.toISOString(), member.newsletter_opt_in_confirmed_at.toISOString());
        assert.equal((await loadEligibleRecipients(partnerId)).length, 1);
        await client.query('UPDATE users SET newsletter_opt_in = FALSE WHERE id = $1', [member.id]);
        assert.equal((await loadEligibleRecipients(partnerId)).length, 0, 'Activation must not bypass an unsubscribe');

        const first = await generateAndSendMonthlyReport({ targetBusinessPartnerId: partnerId });
        assert.equal(first.sentCount, 1);
        const second = await generateAndSendMonthlyReport({ targetBusinessPartnerId: partnerId });
        assert.equal(second.sentCount, 0);
        assert.equal(second.skippedAlreadySentCount, 1);
        assert.equal(simulatedSends, 1);
        await client.query('UPDATE business_partners SET monthly_report_enabled = FALSE WHERE id = $1', [partnerId]);
        assert.equal((await generateAndSendMonthlyReport({ dryRun: true, targetBusinessPartnerId: partnerId })).plannedCount, 0);
        console.log(JSON.stringify({ ok: true, timeZoneAndDst: true, separateReportRecipients: true,
            adminOnlyPreferences: true, newsletterPauseAndConsent: true, tenantIsolation: true,
            duplicateProtection: true, realEmailsSent: 0, fixturesRolledBack: true }));
    } finally {
        await client.query('ROLLBACK');
        client.release();
    }
}

run().catch((error) => {
    console.error('[smoke:monthly-report-preferences]', error.stack || error.message);
    process.exitCode = 1;
}).finally(() => db.end());
