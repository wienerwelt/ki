const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function main() {
  const adminResult = await db.query(`
    SELECT id, auth_version
    FROM users
    WHERE LOWER(role) = 'admin' AND is_active = TRUE
    ORDER BY created_at
    LIMIT 1
  `);
  const admin = adminResult.rows[0];
  assert(admin, 'Kein aktiver Admin für den Sales-Lead-Smoke-Test vorhanden.');

  const marker = `__sales-lifecycle-smoke-${randomUUID()}`;
  let leadId = null;
  let tenantId = null;
  try {
    const inserted = await db.query(
      `INSERT INTO feedback_items
         (type, title, description, name, organization, email, audience, status)
       VALUES ('demo_request', 'Account-Radar Smoke', $1, 'Smoke Test', 'Mobiliti QA',
               'smoke@example.invalid', 'Account-Radar · Sales Premium · 14-Tage-Pilot', 'new')
       RETURNING id`,
      [marker]
    );
    leadId = inserted.rows[0].id;

    const token = jwt.sign(
      { sub: admin.id, av: Number(admin.auth_version || 0) },
      process.env.JWT_SECRET,
      { expiresIn: '5m', algorithm: 'HS256' }
    );
    const headers = { Authorization: `Bearer ${token}` };

    const createTenantResponse = await fetch('http://127.0.0.1:5000/api/admin/business-partners', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: marker,
        slug: `smoke-${randomUUID().slice(0, 8)}`,
        is_active: true,
        allow_automated_newsletter: false,
        newsletter_delivery_mode: 'mobiliti',
        newsletter_recipient_limit: 250,
        enabled_modules: ['sales'],
        default_workspace: 'sales',
        sales_plan: 'basic',
        sales_subscription_status: 'trial',
        sales_trial_ends_on: '2099-12-31',
        sales_monthly_price_eur: 99.5,
        sales_billing_cycle: 'monthly',
      }),
    });
    const createdTenant = await createTenantResponse.json();
    assert(createTenantResponse.ok && createdTenant.id, `Testmandant konnte nicht erstellt werden (${createTenantResponse.status}).`);
    tenantId = createdTenant.id;

    const updateTenantResponse = await fetch(`http://127.0.0.1:5000/api/admin/business-partners/${tenantId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: marker,
        slug: createdTenant.slug,
        is_active: true,
        allow_automated_newsletter: false,
        newsletter_delivery_mode: 'mobiliti',
        newsletter_recipient_limit: 250,
        enabled_modules: ['sales'],
        default_workspace: 'sales',
        sales_plan: 'premium',
        sales_subscription_status: 'paused',
        sales_trial_ends_on: null,
        sales_monthly_price_eur: null,
        sales_billing_cycle: 'annual',
      }),
    });
    const updatedTenant = await updateTenantResponse.json();
    assert(
      updateTenantResponse.ok
        && updatedTenant.sales_plan === 'premium'
        && updatedTenant.sales_subscription_status === 'paused'
        && updatedTenant.sales_trial_ends_on === null
        && updatedTenant.sales_monthly_price_eur === null
        && updatedTenant.sales_billing_cycle === 'annual',
      `Mandanten-Lifecycle konnte nicht aktualisiert werden (${updateTenantResponse.status}).`
    );

    const listResponse = await fetch(`http://127.0.0.1:5000/api/admin/sales-leads?search=${encodeURIComponent(marker)}`, { headers });
    const listPayload = await listResponse.json();
    assert(listResponse.ok, `Sales-Lead-Liste antwortet mit ${listResponse.status}.`);
    assert(listPayload.items?.some((item) => item.id === leadId), 'Testanfrage fehlt in der Admin-Inbox.');

    const updateResponse = await fetch(`http://127.0.0.1:5000/api/admin/sales-leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review' }),
    });
    const updatePayload = await updateResponse.json();
    assert(updateResponse.ok && updatePayload.status === 'in_review', 'Sales-Lead-Status kann nicht aktualisiert werden.');

    const badgeResponse = await fetch('http://127.0.0.1:5000/api/data/notification-counts', { headers });
    const badgePayload = await badgeResponse.json();
    assert(badgeResponse.ok, `Badge-Endpunkt antwortet mit ${badgeResponse.status}.`);
    assert(Number.isFinite(Number(badgePayload.menuCounts?.salesLeads)), 'Sales-Lead-Badge fehlt.');

    console.log(JSON.stringify({ ok: true, leadInbox: true, lifecycleUpdate: true, tenantCommercials: true, adminBadge: true }, null, 2));
  } finally {
    if (leadId) await db.query('DELETE FROM feedback_items WHERE id = $1', [leadId]);
    if (tenantId) await db.query('DELETE FROM business_partners WHERE id = $1', [tenantId]);
  }
}

main()
  .catch((error) => {
    console.error('[smoke:sales-lifecycle]', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
