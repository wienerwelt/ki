// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { SESSION_MAX_AGE_MS } = require('../services/sessionSecurity');
const { getMembershipExpiry, isMembershipExpired } = require('../utils/membershipExpiry');
const { normalizeTenantModules, normalizeWorkspace } = require('../services/tenantModuleService');

const DEMO_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Technische POST-Endpunkte ohne fachliche Datenänderung bleiben im Demo-Modus nutzbar.
const DEMO_ALLOWED_WRITE_PATHS = new Set([
  '/api/auth/logout',
  '/api/session/renew',
  '/api/data/fuel/prices-by-ids',
]);

function rejectDemoMutation(req, res) {
  if (String(req.user?.role || '').toLowerCase() !== 'demo') return false;
  if (DEMO_SAFE_METHODS.has(String(req.method || '').toUpperCase())) return false;
  const requestPath = String(req.originalUrl || req.url || '').split('?')[0];
  if (DEMO_ALLOWED_WRITE_PATHS.has(requestPath)) return false;
  res.status(403).json({ message: 'Demo-Modus: Änderungen sind deaktiviert.' });
  return true;
}

function getTokenFromRequest(req) {
  const candidates = [
    req.header('x-auth-token'),
    (req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null,
    req.cookies?.token,
  ];
  return candidates.find((value) => {
    const token = String(value || '').trim();
    return token && token !== 'null' && token !== 'undefined' && token !== 'cookie-session';
  }) || null;
}

function extractUserId(decoded) {
  const payload = decoded?.user && typeof decoded.user === 'object' ? decoded.user : decoded;
  return payload?.id || payload?.userId || payload?.sub || null;
}

async function loadCurrentUser(userId) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.role, u.business_partner_id,
            u.contribution_score, u.last_login_at, u.first_name, u.last_name,
            u.organization_name, u.profile_image_url, u.membership_level,
            u.is_active, u.active_until, u.auth_version, u.preferred_workspace,
            COALESCE(bp.is_active, TRUE) AS business_partner_is_active,
            bp.subscription_end_date AS business_partner_subscription_end_date,
            bp.enabled_modules AS tenant_modules,
            bp.default_workspace AS tenant_default_workspace,
            bp.sales_plan AS tenant_sales_plan,
            bp.sales_subscription_status AS tenant_sales_subscription_status,
            bp.sales_trial_ends_on AS tenant_sales_trial_ends_on,
            CASE
              WHEN bp.sales_subscription_status = 'active' THEN TRUE
              WHEN bp.sales_subscription_status = 'trial' AND bp.sales_trial_ends_on >= CURRENT_DATE THEN TRUE
              ELSE FALSE
            END AS tenant_sales_access_active,
            CASE
              WHEN bp.sales_subscription_status = 'trial'
                THEN GREATEST(bp.sales_trial_ends_on - CURRENT_DATE, 0)
              ELSE NULL
            END AS tenant_sales_trial_days_remaining
     FROM users u
     LEFT JOIN business_partners bp ON bp.id = u.business_partner_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

const authMiddleware = async (req, res, next) => {
  if (req.securityUserLoaded && req.user) {
    if (rejectDemoMutation(req, res)) return;
    return next();
  }

  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ message: 'Authentifizierung erforderlich.' });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: 'Serverkonfiguration unvollständig.' });

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (!decoded.iat || Date.now() - decoded.iat * 1000 > SESSION_MAX_AGE_MS) {
      return res.status(401).json({ message: 'Sitzung ist abgelaufen. Bitte erneut anmelden.' });
    }
    const userId = extractUserId(decoded);
    if (!userId) return res.status(401).json({ message: 'Sitzung ist ungültig.' });

    const user = await loadCurrentUser(userId);
    const partnerEnd = user?.business_partner_subscription_end_date ? new Date(user.business_partner_subscription_end_date) : null;
    if (!user || user.is_active !== true || user.business_partner_is_active !== true || isMembershipExpired(user.active_until) || (partnerEnd && partnerEnd < new Date(new Date().setHours(0, 0, 0, 0)))) {
      return res.status(401).json({ message: 'Sitzung ist nicht mehr aktiv.' });
    }
    if (Number(decoded.av || 0) !== Number(user.auth_version || 0)) {
      return res.status(401).json({ message: 'Sitzung wurde widerrufen. Bitte erneut anmelden.' });
    }

    const membershipExpiry = getMembershipExpiry(user.active_until);
    const tenantModules = normalizeTenantModules(user.tenant_modules);
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: String(user.role || '').toLowerCase(),
      business_partner_id: user.business_partner_id || null,
      contribution_score: user.contribution_score ?? 0,
      last_login_at: user.last_login_at,
      first_name: user.first_name,
      last_name: user.last_name,
      organization_name: user.organization_name,
      profile_image_url: user.profile_image_url,
      membership_level: user.membership_level,
      preferred_workspace: user.preferred_workspace || null,
      tenant_modules: tenantModules,
      tenant_default_workspace: normalizeWorkspace(user.tenant_default_workspace, tenantModules),
      tenant_sales_plan: user.tenant_sales_plan || 'basic',
      tenant_sales_subscription_status: user.tenant_sales_subscription_status || 'active',
      tenant_sales_trial_ends_on: user.tenant_sales_trial_ends_on || null,
      tenant_sales_trial_days_remaining: user.tenant_sales_trial_days_remaining === null
        ? null
        : Number(user.tenant_sales_trial_days_remaining),
      tenant_sales_access_active: user.tenant_sales_access_active !== false,
      tenant_sales_trial_expired: user.tenant_sales_subscription_status === 'trial'
        && user.tenant_sales_access_active === false,
      active_until: user.active_until,
      membership_expires_on: membershipExpiry.expiresOn,
      membership_days_remaining: membershipExpiry.daysRemaining,
      token_issued_at: decoded.iat ? new Date(decoded.iat * 1000) : null,
    };
    const tokenExpiresAt = decoded.exp ? decoded.exp * 1000 : Number.POSITIVE_INFINITY;
    const absoluteSessionEnd = decoded.iat * 1000 + SESSION_MAX_AGE_MS;
    req.auth = {
      tokenSource: req.cookies?.token === token ? 'cookie' : 'header',
      expiresAt: new Date(Math.min(tokenExpiresAt, absoluteSessionEnd)),
    };
    req.securityUserLoaded = true;
    if (rejectDemoMutation(req, res)) return;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Sitzung ist ungültig oder abgelaufen.' });
  }
};

authMiddleware.getTokenFromRequest = getTokenFromRequest;
authMiddleware.loadCurrentUser = loadCurrentUser;
authMiddleware.__test = { rejectDemoMutation };

module.exports = authMiddleware;
