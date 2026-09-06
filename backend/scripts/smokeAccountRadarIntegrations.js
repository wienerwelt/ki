const { randomUUID } = require('crypto');
const db = require('../config/db');
const {
  createApiToken,
  getDataQuality,
  hashApiToken,
} = require('../services/accountRadarIntegrationService');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function main() {
  const schemaResult = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('account_radar_api_tokens', 'account_radar_api_sync_logs')) AS tables,
      (SELECT COUNT(*)::int FROM information_schema.columns
       WHERE table_schema = 'public'
         AND ((table_name = 'business_partner_accounts' AND column_name = 'external_id')
           OR (table_name = 'business_partner_account_contacts' AND column_name = 'external_id')
           OR (table_name = 'account_radar_tasks' AND column_name = 'external_id'))) AS external_id_columns
  `);
  assert(schemaResult.rows[0]?.tables === 2, 'Integrations-Tabellen fehlen.');
  assert(schemaResult.rows[0]?.external_id_columns === 3, 'Stabile externe IDs fehlen.');

  const partnerResult = await db.query(`
    SELECT id::text
    FROM business_partners
    WHERE is_active = TRUE
      AND sales_plan = 'premium'
      AND 'sales' = ANY(COALESCE(enabled_modules, ARRAY['content']::text[]))
      AND (sales_subscription_status = 'active'
        OR (sales_subscription_status = 'trial' AND sales_trial_ends_on >= CURRENT_DATE))
    ORDER BY created_at
    LIMIT 1
  `);
  const partnerId = partnerResult.rows[0]?.id;
  assert(partnerId, 'Kein aktiver Sales-Premium-Mandant für den Integrations-Smoke-Test vorhanden.');

  const marker = `smoke-${randomUUID()}`;
  const accountExternalId = `${marker}-account`;
  const token = createApiToken();
  let tokenId = null;
  try {
    const insertedToken = await db.query(`
      INSERT INTO account_radar_api_tokens
          (business_partner_id, name, token_prefix, token_hash, scopes, expires_at)
      VALUES ($1, $2, $3, $4, $5::text[], CURRENT_TIMESTAMP + INTERVAL '10 minutes')
      RETURNING id::text
    `, [partnerId, marker, `${token.slice(0, 12)}…`, hashApiToken(token),
      ['accounts:read', 'accounts:write', 'tasks:read', 'tasks:write', 'analytics:read']]);
    tokenId = insertedToken.rows[0].id;

    const storedToken = await db.query('SELECT token_hash, token_prefix FROM account_radar_api_tokens WHERE id = $1', [tokenId]);
    assert(storedToken.rows[0]?.token_hash === hashApiToken(token), 'API-Token-Hash stimmt nicht.');
    assert(storedToken.rows[0]?.token_hash !== token, 'API-Token wurde im Klartext gespeichert.');

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Request-Id': marker };
    const infoResponse = await fetch('http://127.0.0.1:5000/api/integrations/account-radar/v1/', { headers });
    const infoPayload = await infoResponse.json();
    assert(infoResponse.ok && infoPayload.version === 1 && infoPayload.tenantId === partnerId, 'API-Metadaten oder Mandantenbindung fehlen.');
    const createResponse = await fetch(`http://127.0.0.1:5000/api/integrations/account-radar/v1/accounts/${encodeURIComponent(accountExternalId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: 'Integration Smoke Account',
        website_url: 'https://example.invalid',
        status: 'prospect',
        contacts: [{ external_id: `${marker}-contact`, name: 'Erika Integration', email: 'ERIKA@EXAMPLE.INVALID', is_primary: true }],
      }),
    });
    const createPayload = await createResponse.json();
    assert(createResponse.status === 201 && createPayload.data?.external_id === accountExternalId, `API-Account konnte nicht angelegt werden (${createResponse.status}).`);

    const updateResponse = await fetch(`http://127.0.0.1:5000/api/integrations/account-radar/v1/accounts/${encodeURIComponent(accountExternalId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: 'Integration Smoke Account aktualisiert',
        website_url: 'https://example.invalid',
        status: 'active_customer',
        contacts: [{ external_id: `${marker}-contact`, name: 'Erika Integration', email: 'erika@example.invalid', is_primary: true }],
      }),
    });
    assert(updateResponse.status === 200, `Idempotentes Account-Update fehlgeschlagen (${updateResponse.status}).`);

    const listResponse = await fetch('http://127.0.0.1:5000/api/integrations/account-radar/v1/accounts?limit=200', { headers });
    const listPayload = await listResponse.json();
    assert(listResponse.ok && Array.isArray(listPayload.data), `Account-API-Liste fehlgeschlagen (${listResponse.status}).`);
    const account = listPayload.data.find((item) => item.external_id === accountExternalId);
    assert(account?.name.endsWith('aktualisiert'), 'Idempotentes API-Update ist nicht sichtbar.');
    assert(account?.contacts?.[0]?.email === 'erika@example.invalid', 'Kontakt wurde nicht normalisiert oder synchronisiert.');
    assert(Number.isInteger(listPayload.meta?.total) && Number.isInteger(listPayload.meta?.offset), 'API-Paginierungsmetadaten fehlen.');

    const analyticsResponse = await fetch('http://127.0.0.1:5000/api/integrations/account-radar/v1/analytics?period_days=30', { headers });
    const analyticsPayload = await analyticsResponse.json();
    assert(analyticsResponse.ok && analyticsPayload.data?.metrics, `Analytics-API fehlgeschlagen (${analyticsResponse.status}).`);

    const tasksResponse = await fetch('http://127.0.0.1:5000/api/integrations/account-radar/v1/tasks?limit=1', { headers });
    const tasksPayload = await tasksResponse.json();
    assert(tasksResponse.ok && Array.isArray(tasksPayload.data), `Aufgaben-API-Liste fehlgeschlagen (${tasksResponse.status}).`);

    const quality = await getDataQuality(partnerId);
    assert(Number.isInteger(quality.score) && Array.isArray(quality.issues), 'Datenqualitätsprüfung liefert kein gültiges Ergebnis.');

    await db.query("UPDATE account_radar_api_tokens SET scopes = ARRAY['accounts:read']::text[] WHERE id = $1", [tokenId]);
    const scopeResponse = await fetch('http://127.0.0.1:5000/api/integrations/account-radar/v1/analytics', { headers });
    assert(scopeResponse.status === 403, 'Fehlende API-Berechtigung wird nicht abgegrenzt.');

    await db.query('UPDATE account_radar_api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1', [tokenId]);
    const revokedResponse = await fetch('http://127.0.0.1:5000/api/integrations/account-radar/v1/accounts?limit=1', { headers });
    assert(revokedResponse.status === 401, 'Widerrufenes API-Token bleibt verwendbar.');

    console.log(JSON.stringify({
      ok: true,
      tokenStorage: 'SHA-256, Klartext nur einmal sichtbar',
      tenantScope: 'Premium-Mandant fest im Token gebunden',
      accountUpsert: 'create + idempotent update + contact sync OK',
      analyticsExport: true,
      taskExport: true,
      scopeEnforcement: true,
      dataQualityScore: quality.score,
      revokedTokenRejected: true,
    }, null, 2));
  } finally {
    await db.query('DELETE FROM business_partner_accounts WHERE business_partner_id = $1 AND external_id = $2', [partnerId, accountExternalId]);
    if (tokenId) {
      await db.query('DELETE FROM account_radar_api_sync_logs WHERE token_id = $1 OR request_id = $2', [tokenId, marker]);
      await db.query('DELETE FROM account_radar_api_tokens WHERE id = $1', [tokenId]);
    }
  }
}

main()
  .catch((error) => {
    console.error('[smoke:account-radar-integrations]', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
