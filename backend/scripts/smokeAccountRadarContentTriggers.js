const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const {
  assignMarketSignalToAccount,
  assertAccountsBelongToTenant,
  findContentTriggerMatches,
  importContentTriggerMatches,
  listMarketSignals,
  updateMarketSignalStatus,
} = require('../services/accountRadarTriggerService');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function main() {
  const client = await db.connect();
  try {
    const schema = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('account_radar_trigger_profiles', 'account_radar_content_trigger_matches')
    `);
    assert(schema.rows[0]?.count === 2, 'Tabellen für CONTENT-Trigger fehlen.');

    const contextResult = await client.query(`
      SELECT partner.id::text AS partner_id, account.id::text AS account_id, account.name,
             manager.id::text AS manager_id, manager.auth_version AS manager_auth_version
      FROM business_partners partner
      JOIN business_partner_accounts account ON account.business_partner_id = partner.id
      JOIN LATERAL (
        SELECT id, auth_version FROM users
        WHERE business_partner_id = partner.id
          AND is_active = TRUE
          AND lower(role) IN ('admin', 'assistenz', 'sales_manager')
        ORDER BY CASE WHEN lower(role) = 'admin' THEN 0 ELSE 1 END, created_at
        LIMIT 1
      ) manager ON TRUE
      WHERE partner.sales_plan = 'premium'
        AND partner.is_active = TRUE
        AND (partner.sales_subscription_status = 'active'
          OR (partner.sales_subscription_status = 'trial' AND partner.sales_trial_ends_on >= CURRENT_DATE))
        AND account.is_active = TRUE
        AND 'sales' = ANY(COALESCE(partner.enabled_modules, ARRAY['content']::text[]))
      ORDER BY partner.created_at, account.created_at
      LIMIT 1
    `);
    const context = contextResult.rows[0];
    assert(context, 'Kein aktiver Premium-Account für den CONTENT-Trigger-Test vorhanden.');
    const existingProfilesResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM account_radar_trigger_profiles WHERE business_partner_id = $1',
      [context.partner_id]
    );
    const existingProfileCount = Number(existingProfilesResult.rows[0]?.count || 0);

    await client.query('BEGIN');
    const marker = `trigger-smoke-${randomUUID()}`;
    const contentResult = await client.query(
      `INSERT INTO scraped_content
        (source_identifier, original_url, title, summary, full_text, published_date,
         category, category_id, relevance_score, region)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'news', $6, 85, 'AT')
       RETURNING id::text`,
      [marker, `https://example.invalid/${marker}`,
        `${context.name} investiert in einen neuen Mobilitätsstandort`,
        `${context.name} startet ein relevantes Investitionsprojekt.`,
        `Der Account ${context.name} investiert. ${marker}`,
        null]
    );
    const profileResult = await client.query(
      `INSERT INTO account_radar_trigger_profiles
        (business_partner_id, name, description, is_active, include_keywords, scope_mode, account_ids,
         lookback_days, min_content_relevance)
       VALUES ($1, $2, 'Smoke-Test', TRUE, ARRAY['investiert']::text[], 'selected', ARRAY[$3]::uuid[], 7, 50)
       RETURNING *`,
      [context.partner_id, marker, context.account_id]
    );
    const profile = profileResult.rows[0];

    const preview = await findContentTriggerMatches(client, context.partner_id, profile, { limit: 20 });
    const ownMatch = preview.matches.find((match) => match.content_id === contentResult.rows[0].id);
    assert(ownMatch?.account_id === context.account_id, 'Archivtreffer wurde nicht dem richtigen Account zugeordnet.');
    assert(ownMatch?.matched_keywords?.includes('investiert'), 'Auslösender Suchbegriff fehlt.');

    const excludedPreview = await findContentTriggerMatches(client, context.partner_id, {
      ...profile,
      exclude_keywords: [marker],
    }, { limit: 20 });
    assert(!excludedPreview.matches.some((match) => match.content_id === contentResult.rows[0].id),
      'Ausschlussbegriff verhindert den Treffer nicht.');

    const firstImport = await importContentTriggerMatches(client, context.partner_id, profile, { limit: 20 });
    assert(firstImport.inserted >= 1, 'CONTENT-Treffer wurde nicht in den Account-Radar übernommen.');
    const secondImport = await importContentTriggerMatches(client, context.partner_id, profile, { limit: 20 });
    assert(secondImport.inserted === 0, 'Wiederholte Prüfung erzeugt ein Duplikat.');

    const linked = await client.query(
      `SELECT match.matched_keywords, match.match_score, article.article_url
       FROM account_radar_content_trigger_matches match
       JOIN business_partner_tracked_articles article ON article.id = match.tracked_article_id
       WHERE match.trigger_profile_id = $1 AND match.scraped_content_id = $2`,
      [profile.id, contentResult.rows[0].id]
    );
    assert(linked.rows.length === 1 && linked.rows[0].article_url.includes(marker),
      'Nachvollziehbare Verbindung zwischen CONTENT und Radar-Signal fehlt.');

    const marketProfileResult = await client.query(
      `INSERT INTO account_radar_trigger_profiles
        (business_partner_id, name, description, is_active, include_keywords, scope_mode,
         lookback_days, min_content_relevance)
       VALUES ($1, $2, 'Accountloser Smoke-Test', TRUE, ARRAY[$3]::text[], 'unassigned', 7, 50)
       RETURNING *`,
      [context.partner_id, `${marker}-market`, marker]
    );
    const marketProfile = marketProfileResult.rows[0];
    const marketPreview = await findContentTriggerMatches(client, context.partner_id, marketProfile, { limit: 20 });
    const marketMatch = marketPreview.matches.find((match) => match.content_id === contentResult.rows[0].id);
    assert(marketMatch && marketMatch.account_id === null,
      'Accountloser Markt-/Ereignistreffer wurde nicht erkannt.');
    const firstMarketImport = await importContentTriggerMatches(client, context.partner_id, marketProfile, { limit: 20 });
    const secondMarketImport = await importContentTriggerMatches(client, context.partner_id, marketProfile, { limit: 20 });
    assert(firstMarketImport.inserted >= 1 && secondMarketImport.inserted === 0,
      'Accountloser Markt-/Ereignistreffer wird nicht dedupliziert.');
    const storedMarketMatch = await client.query(
      `SELECT id::text, account_id, tracked_article_id, review_status
       FROM account_radar_content_trigger_matches
       WHERE trigger_profile_id = $1 AND scraped_content_id = $2`,
      [marketProfile.id, contentResult.rows[0].id]
    );
    assert(storedMarketMatch.rows.length === 1
      && storedMarketMatch.rows[0].account_id === null
      && storedMarketMatch.rows[0].tracked_article_id === null
      && storedMarketMatch.rows[0].review_status === 'new',
    'Markt-/Ereignistreffer verfälscht Accountbestand oder Pipeline.');
    const marketSignals = await listMarketSignals(client, context.partner_id, { limit: 20 });
    assert(marketSignals.items.some((signal) => signal.id === storedMarketMatch.rows[0]?.id),
    'Markt-/Ereignistreffer wird nicht in der Sales-Übersicht bereitgestellt.');
    await updateMarketSignalStatus(
      client,
      context.partner_id,
      storedMarketMatch.rows[0].id,
      'ignored',
      context.manager_id
    );
    const ignoredMarketSignals = await listMarketSignals(client, context.partner_id, { limit: 20, status: 'ignored' });
    assert(ignoredMarketSignals.items.some((signal) => signal.id === storedMarketMatch.rows[0].id)
      && ignoredMarketSignals.counts.ignored >= 1,
    'Markt-/Ereignistreffer kann nicht ausgeblendet werden.');
    await updateMarketSignalStatus(
      client,
      context.partner_id,
      storedMarketMatch.rows[0].id,
      'new',
      context.manager_id
    );
    const assignedMarketSignal = await assignMarketSignalToAccount(
      client,
      context.partner_id,
      storedMarketMatch.rows[0].id,
      context.account_id,
      context.manager_id
    );
    const assignedMarketMatch = await client.query(
      `SELECT account_id::text, tracked_article_id::text, review_status
       FROM account_radar_content_trigger_matches
       WHERE trigger_profile_id = $1 AND scraped_content_id = $2 AND account_id = $3`,
      [marketProfile.id, contentResult.rows[0].id, context.account_id]
    );
    assert(assignedMarketSignal.accountId === context.account_id
      && assignedMarketMatch.rows[0]?.account_id === context.account_id
      && assignedMarketMatch.rows[0]?.tracked_article_id
      && assignedMarketMatch.rows[0]?.review_status === 'assigned',
    'Markt-/Ereignistreffer wird nicht sauber in den Account-Radar übernommen.');

    const foreignAccount = await client.query(
      'SELECT id::text FROM business_partner_accounts WHERE business_partner_id <> $1 LIMIT 1',
      [context.partner_id]
    );
    if (foreignAccount.rows[0]) {
      let rejected = false;
      try {
        await assertAccountsBelongToTenant(client, context.partner_id, [foreignAccount.rows[0].id]);
      } catch (error) {
        rejected = error.statusCode === 400;
      }
      assert(rejected, 'Ein mandantenfremder Account wurde im Trigger-Profil akzeptiert.');
    }

    await client.query('ROLLBACK');

    const token = jwt.sign(
      { sub: context.manager_id, av: Number(context.manager_auth_version || 0) },
      process.env.JWT_SECRET,
      { expiresIn: '5m', algorithm: 'HS256' }
    );
    const radarResponse = await fetch('http://127.0.0.1:5000/api/data/account-intelligence?limitPerGroup=1&periodDays=30', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const radarPayload = await radarResponse.json().catch(() => null);
    assert(radarResponse.ok && Array.isArray(radarPayload),
      `Account-Radar-Ausgabe mit Trigger-Metadaten ist fehlgeschlagen (${radarResponse.status}).`);

    const triggerResponse = await fetch('http://127.0.0.1:5000/api/account-radar/triggers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const triggerPayload = await triggerResponse.json().catch(() => null);
    assert(triggerResponse.ok && Array.isArray(triggerPayload?.profiles)
      && triggerPayload.profiles.length >= 7 && triggerPayload.entitlements?.features?.contentTriggers,
    `Trigger-Verwaltungs-API ist fehlgeschlagen (${triggerResponse.status}).`);
    const marketResponse = await fetch('http://127.0.0.1:5000/api/account-radar/market-signals?limit=12', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const marketPayload = await marketResponse.json().catch(() => null);
    assert(marketResponse.ok && Array.isArray(marketPayload?.items)
      && Number.isInteger(marketPayload?.total),
    `Markt-/Ereignis-API ist fehlgeschlagen (${marketResponse.status}).`);
    if (existingProfileCount === 0) {
      await client.query(
        'DELETE FROM account_radar_trigger_profiles WHERE business_partner_id = $1 AND template_key IS NOT NULL',
        [context.partner_id]
      );
    }

    console.log(JSON.stringify({
      ok: true,
      ruleBased: true,
      aiTokens: 0,
      tenantScope: true,
      cascadingScope: true,
      unassignedEvents: true,
      exclusions: true,
      deduplication: true,
      traceableContentSource: true,
      radarEndpoint: true,
      managementEndpoint: true,
      marketSignalsEndpoint: true,
      marketSignalWorkflow: true,
    }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error('[smoke:account-radar-content-triggers]', error.message);
  process.exitCode = 1;
});
