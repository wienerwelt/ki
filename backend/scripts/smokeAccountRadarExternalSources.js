const crypto = require('crypto');
const db = require('../config/db');
const {
  archiveExternalSource,
  listExternalSources,
  setExternalSourceEnabled,
} = require('../services/accountRadarSourceService');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function run() {
  const columns = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scraping_rules'
      AND column_name IN ('business_partner_id', 'account_radar_source_type', 'account_radar_requested_url', 'archived_at')
  `);
  assert(columns.rows[0]?.count === 4, 'Spalten für mandantengebundene externe Quellen fehlen.');

  const partnerResult = await db.query(`
    SELECT id::text, name
    FROM business_partners
    WHERE sales_plan = 'premium'
    ORDER BY created_at
    LIMIT 1
  `);
  assert(partnerResult.rows[0], 'Kein Sales-Premium-Mandant für den Quellen-Smoke-Test vorhanden.');

  const partner = partnerResult.rows[0];
  const otherPartner = await db.query('SELECT id::text FROM business_partners WHERE id <> $1 LIMIT 1', [partner.id]);
  const client = await db.connect();
  const sourceId = crypto.randomUUID();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO scraping_rules
        (id, name, source_identifier, url_pattern, category_default, is_active, region,
         rule_type, scraping_strategy, business_partner_id, account_radar_source_type,
         account_radar_requested_url)
       VALUES ($1, 'Smoke Website', $2, 'https://example.com/news', 'industry_news', FALSE,
               'DACH', 'content', 'standard', $3, 'website', 'https://example.com/news')`,
      [sourceId, `salesmon_smoke_${Date.now()}`, partner.id]
    );

    let sources = await listExternalSources(client, partner.id);
    const inserted = sources.find((source) => source.id === sourceId);
    assert(inserted?.status === 'pending_configuration', 'Unkonfigurierte Website ist nicht eindeutig markiert.');

    if (otherPartner.rows[0]) {
      const foreignSources = await listExternalSources(client, otherPartner.rows[0].id);
      assert(!foreignSources.some((source) => source.id === sourceId), 'Quelle ist über Mandantengrenzen sichtbar.');
    }

    let configurationBlocked = false;
    try {
      await setExternalSourceEnabled(client, partner.id, sourceId, true);
    } catch (error) {
      configurationBlocked = error.statusCode === 409;
    }
    assert(configurationBlocked, 'Unkonfigurierte Website lässt sich unerwartet aktivieren.');

    await client.query(
      `UPDATE scraping_rules
       SET content_container_selector = 'article', title_selector = 'h2', link_selector = 'a'
       WHERE id = $1`,
      [sourceId]
    );
    const enabled = await setExternalSourceEnabled(client, partner.id, sourceId, true);
    assert(enabled.is_active && enabled.schedule, 'Konfigurierte Website wird nicht aktiviert oder erhält keinen Zeitplan.');

    await setExternalSourceEnabled(client, partner.id, sourceId, false);
    sources = await listExternalSources(client, partner.id);
    assert(sources.find((source) => source.id === sourceId)?.status === 'paused', 'Konfigurierte pausierte Website wird falsch markiert.');

    await archiveExternalSource(client, partner.id, sourceId, null);
    sources = await listExternalSources(client, partner.id);
    assert(!sources.some((source) => source.id === sourceId), 'Archivierte Quelle bleibt sichtbar.');

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      ok: true,
      tenantIsolation: true,
      configurationGuard: true,
      lifecycle: true,
    }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    console.error('[smoke:account-radar-external-sources]', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
    // Der importierte Queue-Service hält absichtlich Redis-Verbindungen offen.
    // Im einmaligen Smoke-Test wird der Prozess nach dem sauberen DB-Ende beendet.
    process.exit(process.exitCode || 0);
  });
