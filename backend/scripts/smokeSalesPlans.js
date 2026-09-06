const db = require('../config/db');
const {
  getSalesPlanDefinition,
  getSalesSubscriptionState,
  hasSalesFeature,
  normalizeSalesPlan,
  requireActiveSalesSubscription,
  requireSalesFeature,
} = require('../services/salesPlanService');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runMiddleware = (middleware, user) => new Promise((resolve) => {
  const result = { status: null, body: null, next: false };
  const req = { user };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; resolve(result); return this; },
  };
  middleware(req, res, () => {
    result.next = true;
    resolve(result);
  });
});

async function run() {
  const basic = getSalesPlanDefinition('basic');
  const premium = getSalesPlanDefinition('premium');
  assert(normalizeSalesPlan('invalid') === 'basic', 'Ungültige Pakete fallen nicht auf Basic zurück.');
  assert(basic.limits.accounts === 250 && premium.limits.accounts === 5000, 'Account-Limits stimmen nicht.');
  assert(!basic.features.dataImport && premium.features.dataImport, 'Import-Abgrenzung stimmt nicht.');
  assert(!basic.features.competitorMonitoring && premium.features.competitorMonitoring, 'Wettbewerber-Abgrenzung stimmt nicht.');
  assert(!basic.features.managementPdf && premium.features.managementPdf, 'PDF-Abgrenzung stimmt nicht.');
  assert(!basic.features.advancedAnalytics && premium.features.advancedAnalytics, 'Analytics-Abgrenzung stimmt nicht.');
  assert(basic.features.dataQuality && premium.features.dataQuality, 'Datenqualitätsprüfung fehlt in einem Sales-Paket.');
  assert(!basic.features.apiIntegration && premium.features.apiIntegration, 'API-Abgrenzung stimmt nicht.');
  assert(basic.limits.apiTokens === 0 && premium.limits.apiTokens === 5, 'API-Token-Limits stimmen nicht.');
  assert(hasSalesFeature('premium', 'aiSalesContext'), 'Premium-KI-Kontext fehlt.');
  assert(!hasSalesFeature('basic', 'aiSalesContext'), 'Basic erhält unerwartet Premium-KI-Kontext.');
  assert(getSalesSubscriptionState({ sales_subscription_status: 'active' }).accessActive, 'Aktives Sales-Abo wird gesperrt.');
  assert(getSalesSubscriptionState({ sales_subscription_status: 'trial', sales_trial_ends_on: '2099-12-31' }).accessActive, 'Laufende Testphase wird gesperrt.');
  assert(getSalesSubscriptionState({ sales_subscription_status: 'trial', sales_trial_ends_on: '2000-01-01' }).trialExpired, 'Abgelaufene Testphase wird nicht erkannt.');
  assert(!getSalesSubscriptionState({ sales_subscription_status: 'paused' }).accessActive, 'Pausiertes Sales-Abo bleibt aktiv.');

  const denied = await runMiddleware(
    requireSalesFeature('dataImport'),
    { role: 'sales_manager', tenant_sales_plan: 'basic' }
  );
  assert(denied.status === 403 && denied.body?.code === 'SALES_FEATURE_NOT_INCLUDED', 'Basic-Import wird nicht gesperrt.');

  const allowed = await runMiddleware(
    requireSalesFeature('dataImport'),
    { role: 'sales_manager', tenant_sales_plan: 'premium' }
  );
  assert(allowed.next, 'Premium-Import wird fälschlich gesperrt.');

  const expiredTrial = await runMiddleware(
    requireActiveSalesSubscription,
    { role: 'sales_manager', tenant_sales_subscription_status: 'trial', tenant_sales_trial_ends_on: '2000-01-01' }
  );
  assert(expiredTrial.status === 402 && expiredTrial.body?.code === 'SALES_TRIAL_EXPIRED', 'Abgelaufene Testphase wird nicht serverseitig gesperrt.');

  const paused = await runMiddleware(
    requireActiveSalesSubscription,
    { role: 'sales_manager', tenant_sales_subscription_status: 'paused' }
  );
  assert(paused.status === 403 && paused.body?.code === 'SALES_SUBSCRIPTION_PAUSED', 'Pausiertes Sales-Abo wird nicht serverseitig gesperrt.');

  const activeSubscription = await runMiddleware(
    requireActiveSalesSubscription,
    { role: 'sales_manager', tenant_sales_subscription_status: 'active' }
  );
  assert(activeSubscription.next, 'Aktives Sales-Abo wird serverseitig gesperrt.');

  const schema = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'business_partners' AND column_name = 'sales_plan'
    ) AS sales_plan_column,
    (SELECT COUNT(*)::int FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'business_partners'
       AND column_name IN ('sales_subscription_status', 'sales_trial_ends_on', 'sales_monthly_price_eur', 'sales_billing_cycle')) AS lifecycle_columns
  `);
  assert(schema.rows[0]?.sales_plan_column, 'sales_plan-Spalte fehlt.');
  assert(schema.rows[0]?.lifecycle_columns === 4, 'Sales-Lifecycle-Spalten fehlen.');

  const invalidPlans = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM business_partners
    WHERE sales_plan NOT IN ('basic', 'premium') OR sales_plan IS NULL
  `);
  assert(invalidPlans.rows[0]?.count === 0, 'Mindestens ein Mandant besitzt ein ungültiges Sales-Paket.');

  const invalidSubscriptions = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM business_partners
    WHERE sales_subscription_status NOT IN ('active', 'trial', 'paused')
       OR sales_subscription_status IS NULL
       OR (sales_subscription_status = 'trial' AND sales_trial_ends_on IS NULL)
       OR sales_monthly_price_eur < 0
       OR sales_billing_cycle NOT IN ('monthly', 'annual')
  `);
  assert(invalidSubscriptions.rows[0]?.count === 0, 'Mindestens ein Mandant besitzt einen ungültigen Sales-Lifecycle.');

  const invalidBasicUsage = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM business_partners partner
    WHERE partner.sales_plan = 'basic'
      AND (SELECT COUNT(*) FROM business_partner_accounts account WHERE account.business_partner_id = partner.id) > 250
  `);
  assert(invalidBasicUsage.rows[0]?.count === 0, 'Ein Basic-Mandant überschreitet das Account-Limit.');

  const invalidBasicDigest = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM business_partners partner
    JOIN account_radar_settings settings ON settings.business_partner_id = partner.id
    WHERE partner.sales_plan = 'basic'
      AND settings.digest_frequency IN ('daily', 'weekdays')
  `);
  assert(invalidBasicDigest.rows[0]?.count === 0, 'Ein Basic-Mandant besitzt eine Premium-Versandfrequenz.');

  const invalidRecipientCount = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT partner.id
      FROM business_partners partner
      JOIN account_radar_digest_recipients recipient ON recipient.business_partner_id = partner.id
      GROUP BY partner.id, partner.sales_plan
      HAVING COUNT(*) > CASE WHEN partner.sales_plan = 'premium' THEN 25 ELSE 3 END
    ) invalid
  `);
  assert(invalidRecipientCount.rows[0]?.count === 0, 'Ein Mandant überschreitet sein Report-Empfängerlimit.');

  console.log(JSON.stringify({
    ok: true,
    plans: {
      basic: { limits: basic.limits, features: basic.features },
      premium: { limits: premium.limits, features: premium.features },
    },
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('[smoke:sales-plans]', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
