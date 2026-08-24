const db = require('../config/db');
const { getMembershipExpiry, ACTIVE_MEMBERSHIP_SQL } = require('../utils/membershipExpiry');
const { renderMemberNewsletterEmail } = require('../services/emailTemplates');
const jwt = require('jsonwebtoken');

async function run() {
  const todayInclusive = getMembershipExpiry('2026-08-23', new Date('2026-08-23T21:30:00Z'));
  const yesterdayExpired = getMembershipExpiry('2026-08-22', new Date('2026-08-23T10:00:00Z'));
  if (todayInclusive.isExpired || todayInclusive.daysRemaining !== 0 || !yesterdayExpired.isExpired) {
    throw new Error('Inklusive Ablaufdatumslogik ist inkonsistent.');
  }

  const schema = await db.query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'member_newsletter_enabled') AS preference_column,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_newsletter_campaigns') AS campaign_table
  `);
  if (!schema.rows[0]?.preference_column || !schema.rows[0]?.campaign_table) {
    throw new Error('Mitglieder-Mail-Schema fehlt.');
  }

  const expiredLeak = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM users u
    WHERE u.active_until IS NOT NULL
      AND (u.active_until AT TIME ZONE 'Europe/Vienna')::date
        < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Vienna')::date
      AND ${ACTIVE_MEMBERSHIP_SQL}
  `);
  if (expiredLeak.rows[0]?.count !== 0) {
    throw new Error('Abgelaufene Nutzer passieren den zentralen Empfängerfilter.');
  }

  const html = renderMemberNewsletterEmail({
    campaign: { subject: 'Test', body_text: '<script>alert(1)</script>\n\nAbsatz' },
    partner: { name: 'Testmandant' },
    user: { first_name: '<Admin>' },
    unsubscribeUrl: 'https://example.test/preferences/token',
  });
  if (html.includes('<script>alert(1)</script>') || !html.includes('&lt;script&gt;') || !html.includes('E-Mail-Einstellungen ändern') || !html.includes('Freundliche Grüße')) {
    throw new Error('Template-Escaping, Abmeldelink oder Mandantensignatur fehlt.');
  }

  const [adminResult, partnerResult] = await Promise.all([
    db.query(`SELECT id, auth_version FROM users u WHERE role = 'admin' AND is_active = TRUE AND ${ACTIVE_MEMBERSHIP_SQL} ORDER BY created_at LIMIT 1`),
    db.query(`SELECT id FROM business_partners WHERE is_active = TRUE ORDER BY created_at LIMIT 1`),
  ]);
  if (!adminResult.rows[0] || !partnerResult.rows[0]) throw new Error('Kein aktiver Admin oder Mandant für den API-Smoke-Test vorhanden.');
  const token = jwt.sign(
    { sub: adminResult.rows[0].id, role: 'admin', av: Number(adminResult.rows[0].auth_version || 0) },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '5m' }
  );
  const headers = { Authorization: `Bearer ${token}` };
  const apiBase = `http://127.0.0.1:${process.env.PORT || 5000}`;
  const previewResponse = await fetch(`${apiBase}/api/admin/briefing/member-newsletters/recipients?bpId=${partnerResult.rows[0].id}`, { headers });
  if (!previewResponse.ok) throw new Error(`Empfängervorschau-API antwortet mit ${previewResponse.status}.`);
  const preview = await previewResponse.json();
  if (!Number.isInteger(preview.eligible_count) || !preview.excluded || !preview.effective_mode
      || !Array.isArray(preview.recipients) || !Array.isArray(preview.membership_levels)
      || !preview.signature?.name) {
    throw new Error('Empfängervorschau-API liefert keinen vollständigen Vertrag.');
  }

  const assistantResult = await db.query(`
    SELECT id, business_partner_id, auth_version
    FROM users u
    WHERE role = 'assistenz' AND is_active = TRUE AND business_partner_id IS NOT NULL
      AND ${ACTIVE_MEMBERSHIP_SQL}
    ORDER BY created_at LIMIT 1
  `);
  let assistantBoundaryChecked = false;
  if (assistantResult.rows[0]) {
    const foreignPartnerResult = await db.query(
      `SELECT id FROM business_partners WHERE is_active = TRUE AND id <> $1 ORDER BY created_at LIMIT 1`,
      [assistantResult.rows[0].business_partner_id]
    );
    if (foreignPartnerResult.rows[0]) {
      const assistantToken = jwt.sign(
        { sub: assistantResult.rows[0].id, role: 'assistenz', av: Number(assistantResult.rows[0].auth_version || 0) },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '5m' }
      );
      const assistantHeaders = { Authorization: `Bearer ${assistantToken}` };
      const ownResponse = await fetch(`${apiBase}/api/admin/briefing/member-newsletters/recipients?bpId=${assistantResult.rows[0].business_partner_id}`, { headers: assistantHeaders });
      const foreignResponse = await fetch(`${apiBase}/api/admin/briefing/member-newsletters/recipients?bpId=${foreignPartnerResult.rows[0].id}`, { headers: assistantHeaders });
      if (!ownResponse.ok || foreignResponse.status !== 403) {
        throw new Error('Mandantengrenze für Assistenz ist fehlerhaft.');
      }
      assistantBoundaryChecked = true;
    }
  }
  const meResponse = await fetch(`${apiBase}/api/users/me`, { headers });
  if (!meResponse.ok) throw new Error(`/api/users/me antwortet mit ${meResponse.status}.`);
  const me = await meResponse.json();
  if (!Object.prototype.hasOwnProperty.call(me, 'membership_days_remaining') || !Object.prototype.hasOwnProperty.call(me, 'member_newsletter_enabled')) {
    throw new Error('Profil liefert Ablaufhinweis oder Mitglieder-Mail-Präferenz nicht aus.');
  }

  console.log(JSON.stringify({
    inclusiveExpiry: true,
    schemaReady: true,
    expiredRecipientsExcluded: true,
    templateEscaped: true,
    apiContracts: true,
    adminCrossTenantPreview: true,
    assistantBoundaryChecked,
  }));
}

run()
  .catch((error) => {
    console.error('[smoke:member-newsletter] fehlgeschlagen:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
