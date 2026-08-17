const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { campaignKeyFor, resolveDeliveryPlan } = require('../services/newsletterDeliveryService');

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET fehlt.');

  const directPlan = resolveDeliveryPlan({ newsletter_delivery_mode: 'mobiliti', newsletter_recipient_limit: 250 }, 250);
  const fallbackPlan = resolveDeliveryPlan({ newsletter_delivery_mode: 'mobiliti', newsletter_recipient_limit: 250 }, 251);
  const keyA = campaignKeyFor([{ id: 'b' }, { id: 'a' }], 'daily', new Date('2026-08-17T08:30:00Z'));
  const keyB = campaignKeyFor([{ id: 'a' }, { id: 'b' }], 'daily', new Date('2026-08-17T20:00:00Z'));
  if (directPlan.mode !== 'mobiliti' || fallbackPlan.mode !== 'export' || keyA !== keyB) {
    throw new Error('Versandlimit oder Idempotenzschlüssel arbeitet nicht deterministisch.');
  }

  const cronResult = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM cronjobs
    WHERE name = 'daily-briefing' AND is_active = TRUE
  `);
  if (cronResult.rows[0].count !== 1) {
    throw new Error(`Es wird genau ein aktiver daily-briefing-Job erwartet, gefunden: ${cronResult.rows[0].count}.`);
  }

  const invalidConfig = await db.query(`
    SELECT id, name, newsletter_delivery_mode
    FROM business_partners
    WHERE newsletter_delivery_mode NOT IN ('mobiliti', 'export', 'external')
       OR newsletter_recipient_limit NOT BETWEEN 1 AND 100000
       OR (newsletter_delivery_mode = 'export'
           AND NULLIF(BTRIM(COALESCE(newsletter_export_email, email, '')), '') IS NULL)
       OR (newsletter_delivery_mode = 'external'
           AND NULLIF(BTRIM(COALESCE(newsletter_external_signup_url, '')), '') IS NULL)
  `);
  if (invalidConfig.rowCount > 0) {
    throw new Error(`Ungültige Newsletter-Konfiguration bei: ${invalidConfig.rows.map((row) => row.name).join(', ')}.`);
  }

  const adminResult = await db.query(`
    SELECT id, email, role, business_partner_id
    FROM users
    WHERE role = 'admin' AND business_partner_id IS NOT NULL AND is_active = TRUE
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const admin = adminResult.rows[0];
  if (!admin) throw new Error('Kein aktiver Admin mit Mandant für den Smoke-Test gefunden.');

  const token = jwt.sign({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    business_partner_id: admin.business_partner_id,
  }, process.env.JWT_SECRET, { expiresIn: '2m' });
  const headers = { Authorization: `Bearer ${token}` };
  const baseUrl = process.env.SMOKE_API_URL || 'http://127.0.0.1:5000';

  const [profileResponse, configResponse, debugResponse] = await Promise.all([
    fetch(`${baseUrl}/api/users/me`, { headers }),
    fetch(`${baseUrl}/api/data/dashboard/config`, { headers }),
    fetch(`${baseUrl}/api/admin/briefing/debug-status?bpId=${admin.business_partner_id}`, { headers }),
  ]);
  const profile = await profileResponse.json();
  const config = await configResponse.json();
  const debug = await debugResponse.json();

  if (!profileResponse.ok) throw new Error(`Profil-Endpunkt: HTTP ${profileResponse.status}.`);
  if (!configResponse.ok) throw new Error(`Dashboard-Konfiguration: HTTP ${configResponse.status}.`);
  if (!debugResponse.ok) throw new Error(`Briefing-Diagnose: HTTP ${debugResponse.status}.`);
  if (typeof profile.briefing_email_enabled !== 'boolean') {
    throw new Error('Profil liefert briefing_email_enabled nicht aus.');
  }
  if (!['mobiliti', 'export', 'external'].includes(config.businessPartner?.newsletter_delivery_mode)) {
    throw new Error('Dashboard-Konfiguration liefert keinen gültigen Versandmodus.');
  }
  if (debug.newsletter_delivery_mode !== config.businessPartner.newsletter_delivery_mode) {
    throw new Error('Briefing-Diagnose und Dashboard-Konfiguration widersprechen sich beim Versandmodus.');
  }

  const saveResponse = await fetch(`${baseUrl}/api/admin/briefing/settings`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bpId: admin.business_partner_id,
      frequency: debug.briefing_frequency,
      newsletterFrequency: debug.newsletter_frequency,
      autoApprove: debug.auto_approve_briefings,
      newsletterDeliveryMode: debug.newsletter_delivery_mode,
      newsletterExportEmail: debug.newsletter_export_email,
      newsletterExternalSignupUrl: debug.newsletter_external_signup_url,
      newsletterRecipientLimit: debug.newsletter_recipient_limit,
    }),
  });
  if (!saveResponse.ok) {
    const errorBody = await saveResponse.text();
    throw new Error(`Briefing-Einstellungen konnten nicht verlustfrei gespeichert werden: HTTP ${saveResponse.status} ${errorBody}`);
  }

  const assistantResult = await db.query(`
    SELECT id, email, role, business_partner_id
    FROM users
    WHERE role = 'assistenz' AND business_partner_id IS NOT NULL AND is_active = TRUE
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const assistant = assistantResult.rows[0];
  if (assistant) {
    const foreignPartnerResult = await db.query(
      'SELECT id FROM business_partners WHERE id <> $1 ORDER BY created_at ASC LIMIT 1',
      [assistant.business_partner_id]
    );
    const foreignPartner = foreignPartnerResult.rows[0];
    if (foreignPartner) {
      const assistantToken = jwt.sign({
        id: assistant.id,
        email: assistant.email,
        role: assistant.role,
        business_partner_id: assistant.business_partner_id,
      }, process.env.JWT_SECRET, { expiresIn: '2m' });
      const forbiddenResponse = await fetch(
        `${baseUrl}/api/admin/briefing/draft?bpId=${foreignPartner.id}`,
        { headers: { Authorization: `Bearer ${assistantToken}` } }
      );
      if (forbiddenResponse.status !== 403) {
        throw new Error(`Fremdmandanten-Zugriff eines Assistenten wurde nicht mit 403 abgewiesen (HTTP ${forbiddenResponse.status}).`);
      }
    }
  }

  console.log(JSON.stringify({
    ok: true,
    partner: debug.bpName,
    mode: debug.newsletter_delivery_mode,
    frequency: debug.newsletter_frequency,
    recipientLimit: debug.newsletter_recipient_limit,
    potentialRecipients: debug.potentialRecipients,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[smoke:newsletter-delivery]', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
