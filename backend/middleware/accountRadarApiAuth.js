const db = require('../config/db');
const { API_TOKEN_PREFIX, hashApiToken } = require('../services/accountRadarIntegrationService');

const extractToken = (req) => {
  const authorization = String(req.headers.authorization || '').trim();
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token.startsWith(API_TOKEN_PREFIX) ? token : null;
};

const accountRadarApiAuth = async (req, res, next) => {
  const rawToken = extractToken(req);
  if (!rawToken || rawToken.length > 128) {
    return res.status(401).json({ error: 'invalid_token', message: 'Gültiges Account-Radar-API-Token erforderlich.' });
  }

  try {
    const { rows } = await db.query(`
      SELECT token.id::text AS token_id,
             token.business_partner_id::text,
             token.scopes,
             token.expires_at,
             partner.sales_plan,
             partner.sales_subscription_status,
             partner.sales_trial_ends_on
      FROM account_radar_api_tokens token
      JOIN business_partners partner ON partner.id = token.business_partner_id
      WHERE token.token_hash = $1
        AND token.revoked_at IS NULL
        AND token.expires_at > CURRENT_TIMESTAMP
        AND partner.is_active = TRUE
        AND 'sales' = ANY(COALESCE(partner.enabled_modules, ARRAY['content']::TEXT[]))
        AND partner.sales_plan = 'premium'
        AND (
          partner.sales_subscription_status = 'active'
          OR (partner.sales_subscription_status = 'trial' AND partner.sales_trial_ends_on >= CURRENT_DATE)
        )
      LIMIT 1
    `, [hashApiToken(rawToken)]);
    const integration = rows[0];
    if (!integration) {
      return res.status(401).json({ error: 'invalid_token', message: 'API-Token ist ungültig, abgelaufen oder widerrufen.' });
    }

    req.integration = {
      tokenId: integration.token_id,
      businessPartnerId: integration.business_partner_id,
      scopes: Array.isArray(integration.scopes) ? integration.scopes : [],
    };
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-API-Version', '1');

    await db.query(
      `UPDATE account_radar_api_tokens
       SET last_used_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND (last_used_at IS NULL OR last_used_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')`,
      [integration.token_id]
    );
    return next();
  } catch (error) {
    console.error('[AccountRadar API] Tokenprüfung fehlgeschlagen:', error.message);
    return res.status(500).json({ error: 'authentication_failed', message: 'API-Authentifizierung konnte nicht geprüft werden.' });
  }
};

const requireIntegrationScope = (scope) => (req, res, next) => {
  if (req.integration?.scopes?.includes(scope)) return next();
  return res.status(403).json({
    error: 'insufficient_scope',
    message: `Dem API-Token fehlt die Berechtigung ${scope}.`,
    requiredScope: scope,
  });
};

accountRadarApiAuth.extractToken = extractToken;

module.exports = { accountRadarApiAuth, requireIntegrationScope };
