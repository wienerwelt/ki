const SALES_PLAN_DEFINITIONS = Object.freeze({
  basic: Object.freeze({
    key: 'basic',
    label: 'Sales Basic',
    limits: Object.freeze({
      accounts: 250,
      digestRecipients: 3,
      importRows: 0,
      apiTokens: 0,
    }),
    features: Object.freeze({
      accountWorkflow: true,
      teamAssignment: true,
      csvExport: true,
      dataImport: false,
      frequentDigest: false,
      competitorMonitoring: false,
      aiSalesContext: false,
      managementPdf: false,
      advancedAnalytics: false,
      dataQuality: true,
      apiIntegration: false,
    }),
  }),
  premium: Object.freeze({
    key: 'premium',
    label: 'Sales Premium',
    limits: Object.freeze({
      accounts: 5000,
      digestRecipients: 25,
      importRows: 1000,
      apiTokens: 5,
    }),
    features: Object.freeze({
      accountWorkflow: true,
      teamAssignment: true,
      csvExport: true,
      dataImport: true,
      frequentDigest: true,
      competitorMonitoring: true,
      aiSalesContext: true,
      managementPdf: true,
      advancedAnalytics: true,
      dataQuality: true,
      apiIntegration: true,
    }),
  }),
});

const SALES_SUBSCRIPTION_STATUSES = Object.freeze(['active', 'trial', 'paused']);

function normalizeSalesSubscriptionStatus(value, fallback = 'active') {
  const normalized = String(value || '').trim().toLowerCase();
  return SALES_SUBSCRIPTION_STATUSES.includes(normalized) ? normalized : fallback;
}

function getSalesSubscriptionState(value = {}) {
  const status = normalizeSalesSubscriptionStatus(
    value.sales_subscription_status || value.status
  );
  const trialEndsOn = value.sales_trial_ends_on || value.trialEndsOn || null;
  const rawDaysRemaining = value.sales_trial_days_remaining ?? value.trialDaysRemaining;
  const parsedDaysRemaining = rawDaysRemaining === null || rawDaysRemaining === undefined
    ? null
    : Number(rawDaysRemaining);
  const trialDaysRemaining = Number.isFinite(parsedDaysRemaining)
    ? Math.max(0, Math.trunc(parsedDaysRemaining))
    : null;
  let dateExpired = false;
  if (status === 'trial' && trialEndsOn) {
    const normalizedDate = String(trialEndsOn).slice(0, 10);
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
      ? new Date(`${normalizedDate}T23:59:59.999Z`)
      : new Date(trialEndsOn);
    dateExpired = !Number.isNaN(endDate.getTime()) && endDate.getTime() < Date.now();
  }
  const trialExpired = status === 'trial'
    && (
      value.sales_access_active === false
      || value.accessActive === false
      || value.trial_expired === true
      || dateExpired
    );
  const accessActive = status === 'active' || (status === 'trial' && !trialExpired);
  const monthlyPrice = value.sales_monthly_price_eur;

  return {
    status,
    label: status === 'trial' ? 'Testphase' : status === 'paused' ? 'Pausiert' : 'Aktiv',
    trialEndsOn,
    trialDaysRemaining,
    trialExpired,
    accessActive,
    monthlyPriceEur: monthlyPrice === null || monthlyPrice === undefined ? null : Number(monthlyPrice),
    billingCycle: String(value.sales_billing_cycle || 'monthly') === 'annual' ? 'annual' : 'monthly',
  };
}

function normalizeSalesPlan(value, fallback = 'basic') {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SALES_PLAN_DEFINITIONS, normalized)
    ? normalized
    : fallback;
}

function getSalesPlanDefinition(value) {
  const definition = SALES_PLAN_DEFINITIONS[normalizeSalesPlan(value)];
  return {
    key: definition.key,
    label: definition.label,
    limits: { ...definition.limits },
    features: { ...definition.features },
  };
}

function hasSalesFeature(userOrPlan, featureName) {
  if (typeof userOrPlan === 'object' && String(userOrPlan?.role || '').toLowerCase() === 'admin') return true;
  const plan = typeof userOrPlan === 'object'
    ? userOrPlan?.tenant_sales_plan || userOrPlan?.sales_plan
    : userOrPlan;
  return getSalesPlanDefinition(plan).features[featureName] === true;
}

function requireSalesFeature(featureName) {
  return (req, res, next) => {
    if (hasSalesFeature(req.user, featureName)) return next();
    const plan = getSalesPlanDefinition(req.user?.tenant_sales_plan);
    return res.status(403).json({
      message: `Diese Funktion ist nicht in ${plan.label} enthalten.`,
      code: 'SALES_FEATURE_NOT_INCLUDED',
      feature: featureName,
      salesPlan: plan.key,
      upgradeUrl: '/account-radar?request=upgrade#pakete',
    });
  };
}

function requireActiveSalesSubscription(req, res, next) {
  if (String(req.user?.role || '').toLowerCase() === 'admin') return next();
  const subscription = getSalesSubscriptionState({
    sales_subscription_status: req.user?.tenant_sales_subscription_status,
    sales_trial_ends_on: req.user?.tenant_sales_trial_ends_on,
    sales_trial_days_remaining: req.user?.tenant_sales_trial_days_remaining,
    sales_access_active: req.user?.tenant_sales_access_active,
    trial_expired: req.user?.tenant_sales_trial_expired,
  });
  if (subscription.accessActive) return next();
  return res.status(subscription.trialExpired ? 402 : 403).json({
    message: subscription.trialExpired
      ? 'Die Account-Radar-Testphase ist abgelaufen. Bitte Sales Basic oder Premium aktivieren.'
      : 'Der Account-Radar ist für diesen Mandanten derzeit pausiert.',
    code: subscription.trialExpired ? 'SALES_TRIAL_EXPIRED' : 'SALES_SUBSCRIPTION_PAUSED',
    subscription,
    upgradeUrl: '/account-radar?request=upgrade#pakete',
  });
}

async function getBusinessPartnerSalesPlan(queryable, businessPartnerId, options = {}) {
  const result = await queryable.query(
    `SELECT sales_plan,
            sales_subscription_status,
            sales_trial_ends_on,
            sales_monthly_price_eur,
            sales_billing_cycle,
            CASE
              WHEN sales_subscription_status = 'active' THEN TRUE
              WHEN sales_subscription_status = 'trial' AND sales_trial_ends_on >= CURRENT_DATE THEN TRUE
              ELSE FALSE
            END AS sales_access_active,
            CASE
              WHEN sales_subscription_status = 'trial'
                THEN GREATEST(sales_trial_ends_on - CURRENT_DATE, 0)
              ELSE NULL
            END AS sales_trial_days_remaining,
            (SELECT COUNT(*)::int
             FROM business_partner_accounts account
             WHERE account.business_partner_id = business_partners.id) AS account_count
     FROM business_partners
     WHERE id = $1${options.forUpdate ? ' FOR UPDATE' : ''}`,
    [businessPartnerId]
  );
  if (!result.rows.length) {
    const error = new Error('Mandant wurde nicht gefunden.');
    error.statusCode = 404;
    throw error;
  }
  const definition = getSalesPlanDefinition(result.rows[0].sales_plan);
  return {
    ...definition,
    subscription: getSalesSubscriptionState(result.rows[0]),
    usage: { accounts: Number(result.rows[0].account_count || 0) },
  };
}

async function assertAccountCapacity(queryable, businessPartnerId, additionalAccounts = 1) {
  const entitlements = await getBusinessPartnerSalesPlan(queryable, businessPartnerId, { forUpdate: true });
  if (entitlements.usage.accounts + additionalAccounts > entitlements.limits.accounts) {
    const error = new Error(
      `${entitlements.label} erlaubt maximal ${entitlements.limits.accounts.toLocaleString('de-DE')} Accounts.`
    );
    error.statusCode = 409;
    error.code = 'SALES_ACCOUNT_LIMIT_REACHED';
    error.entitlements = entitlements;
    throw error;
  }
  return entitlements;
}

module.exports = {
  SALES_PLAN_DEFINITIONS,
  SALES_SUBSCRIPTION_STATUSES,
  assertAccountCapacity,
  getBusinessPartnerSalesPlan,
  getSalesPlanDefinition,
  getSalesSubscriptionState,
  hasSalesFeature,
  normalizeSalesPlan,
  normalizeSalesSubscriptionStatus,
  requireActiveSalesSubscription,
  requireSalesFeature,
};
