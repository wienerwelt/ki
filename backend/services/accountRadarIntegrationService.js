const crypto = require('crypto');
const db = require('../config/db');

const API_TOKEN_PREFIX = 'mra_';
const API_SCOPES = Object.freeze([
  'accounts:read',
  'accounts:write',
  'tasks:read',
  'tasks:write',
  'analytics:read',
]);

const hashApiToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''), 'utf8')
  .digest('hex');

const createApiToken = () => `${API_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;

const normalizeScopes = (value) => {
  const requested = Array.isArray(value) ? value : [];
  const scopes = Array.from(new Set(requested.map((scope) => String(scope || '').trim())))
    .filter((scope) => API_SCOPES.includes(scope));
  if (!scopes.length || scopes.length !== new Set(requested.map((scope) => String(scope || '').trim())).size) {
    const error = new Error('Mindestens eine gültige API-Berechtigung ist erforderlich.');
    error.statusCode = 400;
    throw error;
  }
  return scopes;
};

const normalizeExternalId = (value, label = 'Externe ID') => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 160 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    const error = new Error(`${label} muss 1 bis 160 druckbare Zeichen enthalten.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

const normalizeOptionalText = (value, maxLength) => {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizeOptionalEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return null;
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('E-Mail-Adresse ist ungültig.');
    error.statusCode = 400;
    throw error;
  }
  return email;
};

const normalizeOptionalUrl = (value, label = 'URL') => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (_) {
    const error = new Error(`${label} ist ungültig.`);
    error.statusCode = 400;
    throw error;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    const error = new Error(`${label} muss eine öffentliche HTTP-/HTTPS-Adresse sein.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.toString().slice(0, 2000);
};

const normalizeHost = (value) => {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch (_) {
    return null;
  }
};

async function logApiSync({ businessPartnerId, tokenId, operation, resourceType, externalId = null, responseStatus, durationMs, requestId = null }) {
  try {
    await db.query(
      `INSERT INTO account_radar_api_sync_logs
          (business_partner_id, token_id, operation, resource_type, external_id, response_status, duration_ms, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [businessPartnerId, tokenId, operation, resourceType, externalId, responseStatus, durationMs, requestId]
    );
  } catch (error) {
    console.error('[AccountRadar API] Sync-Protokoll konnte nicht geschrieben werden:', error.message);
  }
}

async function getDataQuality(businessPartnerId) {
  const [accountsResult, tasksResult, syncResult] = await Promise.all([
    db.query(`
      SELECT account.id::text, account.name, account.website_url, account.contact_email,
             account.owner_user_id, account.updated_at,
             COUNT(contact.id)::int AS contact_count
      FROM business_partner_accounts account
      LEFT JOIN business_partner_account_contacts contact ON contact.account_id = account.id
      WHERE account.business_partner_id = $1
        AND account.is_active = TRUE
      GROUP BY account.id
      ORDER BY account.name
    `, [businessPartnerId]),
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE task.task_status = 'open' AND task.follow_up_at < CURRENT_TIMESTAMP)::int AS overdue,
        COUNT(*) FILTER (WHERE task.task_status = 'open' AND task.assigned_user_id IS NULL)::int AS unassigned,
        COUNT(*) FILTER (WHERE task.task_status = 'open' AND task.action_type = 'contact_planned' AND task.contact_id IS NULL)::int AS missing_contact,
        COUNT(*) FILTER (WHERE task.sales_stage IN ('contacted', 'meeting', 'offer') AND task.opportunity_value_eur IS NULL)::int AS missing_value
      FROM account_radar_tasks task
      WHERE task.business_partner_id = $1
        AND task.task_status <> 'cancelled'
    `, [businessPartnerId]),
    db.query(`
      SELECT operation, resource_type, response_status, duration_ms, created_at
      FROM account_radar_api_sync_logs
      WHERE business_partner_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [businessPartnerId]),
  ]);

  const accounts = accountsResult.rows;
  const normalizedNames = new Map();
  const normalizedHosts = new Map();
  accounts.forEach((account) => {
    const name = String(account.name || '').trim().toLocaleLowerCase('de');
    if (name) normalizedNames.set(name, (normalizedNames.get(name) || 0) + 1);
    const host = normalizeHost(account.website_url);
    if (host) normalizedHosts.set(host, (normalizedHosts.get(host) || 0) + 1);
  });
  const duplicateNames = Array.from(normalizedNames.values()).filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  const duplicateDomains = Array.from(normalizedHosts.values()).filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  const task = tasksResult.rows[0] || {};
  const counts = {
    accounts: accounts.length,
    missingWebsite: accounts.filter((account) => !account.website_url).length,
    missingOwner: accounts.filter((account) => !account.owner_user_id).length,
    missingContact: accounts.filter((account) => Number(account.contact_count || 0) === 0).length,
    staleAccounts: accounts.filter((account) => {
      const updatedAt = new Date(account.updated_at || 0);
      return Number.isNaN(updatedAt.getTime()) || updatedAt.getTime() < Date.now() - 180 * 86400000;
    }).length,
    duplicateNames,
    duplicateDomains,
    overdueTasks: Number(task.overdue || 0),
    unassignedTasks: Number(task.unassigned || 0),
    plannedWithoutContact: Number(task.missing_contact || 0),
    pipelineWithoutValue: Number(task.missing_value || 0),
  };

  const issueDefinitions = [
    ['duplicateDomains', 'Doppelte Website-Domains', 'error', 8],
    ['duplicateNames', 'Mögliche doppelte Account-Namen', 'warning', 6],
    ['overdueTasks', 'Überfällige Aufgaben', 'error', 8],
    ['unassignedTasks', 'Offene Aufgaben ohne Verantwortlichen', 'warning', 5],
    ['plannedWithoutContact', 'Kontaktplanungen ohne Ansprechpartner', 'warning', 4],
    ['pipelineWithoutValue', 'Offene Pipeline ohne Umsatzpotenzial', 'info', 2],
    ['missingWebsite', 'Accounts ohne Website', 'warning', 3],
    ['missingOwner', 'Accounts ohne Account-Owner', 'warning', 3],
    ['missingContact', 'Accounts ohne Ansprechpartner', 'info', 2],
    ['staleAccounts', 'Seit über 180 Tagen nicht gepflegt', 'info', 2],
  ];
  const issues = issueDefinitions
    .map(([key, label, severity, weight]) => ({ key, label, severity, count: counts[key], weight }))
    .filter((issue) => issue.count > 0);
  const denominator = Math.max(counts.accounts, 1);
  const deduction = issues.reduce((sum, issue) => (
    sum + Math.min(issue.weight * 2, (issue.count / denominator) * issue.weight * 10)
  ), 0);

  return {
    generatedAt: new Date().toISOString(),
    score: Math.max(0, Math.round(100 - deduction)),
    counts,
    issues,
    recentSyncs: syncResult.rows,
  };
}

module.exports = {
  API_SCOPES,
  API_TOKEN_PREFIX,
  createApiToken,
  getDataQuality,
  hashApiToken,
  logApiSync,
  normalizeScopes,
  normalizeExternalId,
  normalizeOptionalEmail,
  normalizeOptionalText,
  normalizeOptionalUrl,
};
