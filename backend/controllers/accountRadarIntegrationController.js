const crypto = require('crypto');
const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
const { getAccountRadarAnalytics } = require('../services/accountRadarAnalyticsService');
const {
  API_SCOPES,
  createApiToken,
  getDataQuality,
  hashApiToken,
  logApiSync,
  normalizeExternalId,
  normalizeOptionalEmail,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeScopes,
} = require('../services/accountRadarIntegrationService');
const { assertAccountCapacity, getBusinessPartnerSalesPlan } = require('../services/salesPlanService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_STATUSES = new Set(['prospect', 'active_customer', 'churned']);
const TASK_STATUSES = new Set(['open', 'done']);
const SALES_STAGES = new Set(['contacted', 'meeting', 'offer', 'won', 'lost']);
const ACTION_TYPES = new Set(['contact_planned', 'follow_up']);
const CONTACT_CHANNELS = new Set(['email', 'phone', 'linkedin', 'video_call', 'in_person', 'contact_form', 'other']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const TOKEN_DURATIONS = new Set([30, 90, 180, 365]);

const boundedLimit = (value) => Math.min(Math.max(Number.parseInt(String(value || 100), 10) || 100, 1), 200);
const parseUpdatedSince = (value) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    const error = new Error('updated_since muss ein gültiger ISO-Zeitpunkt sein.');
    error.statusCode = 400;
    throw error;
  }
  return date.toISOString();
};
const enumValue = (value, allowed, label, fallback = null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized && fallback !== undefined) return fallback;
  if (!allowed.has(normalized)) {
    const error = new Error(`${label} ist ungültig.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};
const optionalNumber = (value, label, min, max, integer = false) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    const error = new Error(`${label} muss zwischen ${min} und ${max} liegen.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
};
const optionalDate = (value, label) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${label} muss ein gültiger ISO-Zeitpunkt sein.`);
    error.statusCode = 400;
    throw error;
  }
  return date.toISOString();
};
const requestId = (req, res) => {
  const value = String(req.headers['x-request-id'] || '').trim().slice(0, 120) || crypto.randomUUID();
  res.setHeader('X-Request-Id', value);
  return value;
};
const apiError = (res, error) => res.status(error.statusCode || 500).json({
  error: error.statusCode ? 'invalid_request' : 'internal_error',
  message: error.statusCode ? error.message : 'Die Anfrage konnte nicht verarbeitet werden.',
});

exports.getApiInfo = async (req, res) => res.json({
  name: 'Mobiliti Account-Radar API',
  version: 1,
  tenantId: req.integration.businessPartnerId,
  scopes: req.integration.scopes,
  limits: { requestsPerMinute: 120, pageSizeMax: 200 },
  resources: ['accounts', 'tasks', 'analytics'],
});

exports.getDataQuality = async (req, res) => {
  try {
    return res.json(await getDataQuality(req.user.business_partner_id));
  } catch (error) {
    console.error('[AccountRadar] Datenqualität konnte nicht geladen werden:', error.message);
    return res.status(500).json({ message: 'Datenqualität konnte nicht geprüft werden.' });
  }
};

exports.listTokens = async (req, res) => {
  const tenantId = req.user.business_partner_id;
  try {
    const [tokensResult, entitlements] = await Promise.all([
      db.query(`
        SELECT id::text, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at
        FROM account_radar_api_tokens
        WHERE business_partner_id = $1
        ORDER BY created_at DESC
      `, [tenantId]),
      getBusinessPartnerSalesPlan(db, tenantId),
    ]);
    return res.json({
      tokens: tokensResult.rows,
      allowedScopes: API_SCOPES,
      limit: entitlements.limits.apiTokens,
      active: tokensResult.rows.filter((token) => !token.revoked_at && new Date(token.expires_at) > new Date()).length,
      apiBaseUrl: '/api/integrations/account-radar/v1',
    });
  } catch (error) {
    console.error('[AccountRadar] API-Tokens konnten nicht geladen werden:', error.message);
    return res.status(500).json({ message: 'API-Tokens konnten nicht geladen werden.' });
  }
};

exports.createToken = async (req, res) => {
  const tenantId = req.user.business_partner_id;
  try {
    const name = normalizeOptionalText(req.body?.name, 120);
    if (!name) {
      const error = new Error('Bitte eine verständliche Bezeichnung für die Integration angeben.');
      error.statusCode = 400;
      throw error;
    }
    const scopes = normalizeScopes(req.body?.scopes);
    const expiresInDays = Number(req.body?.expires_in_days || 90);
    if (!TOKEN_DURATIONS.has(expiresInDays)) {
      const error = new Error('Token-Laufzeit muss 30, 90, 180 oder 365 Tage betragen.');
      error.statusCode = 400;
      throw error;
    }
    const entitlements = await getBusinessPartnerSalesPlan(db, tenantId);
    const activeResult = await db.query(`
      SELECT COUNT(*)::int AS count
      FROM account_radar_api_tokens
      WHERE business_partner_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `, [tenantId]);
    if (Number(activeResult.rows[0]?.count || 0) >= entitlements.limits.apiTokens) {
      const error = new Error(`${entitlements.label} erlaubt maximal ${entitlements.limits.apiTokens} aktive API-Tokens.`);
      error.statusCode = 409;
      throw error;
    }

    const token = createApiToken();
    const prefix = `${token.slice(0, 12)}…`;
    const result = await db.query(`
      INSERT INTO account_radar_api_tokens
          (business_partner_id, name, token_prefix, token_hash, scopes, expires_at, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5::text[], CURRENT_TIMESTAMP + ($6::integer * INTERVAL '1 day'), $7)
      RETURNING id::text, name, token_prefix, scopes, expires_at, created_at
    `, [tenantId, name, prefix, hashApiToken(token), scopes, expiresInDays, req.user.id]);
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_API_TOKEN_CREATED',
      status: 'success',
      targetId: result.rows[0].id,
      targetType: 'account_radar_api_token',
      details: { name, scopes, expiresInDays },
      ipAddress: req.ip,
    });
    return res.status(201).json({ ...result.rows[0], token, shownOnce: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'API-Token konnte nicht erstellt werden.' });
  }
};

exports.revokeToken = async (req, res) => {
  if (!UUID_PATTERN.test(String(req.params.tokenId || ''))) return res.status(400).json({ message: 'Ungültige Token-ID.' });
  try {
    const result = await db.query(`
      UPDATE account_radar_api_tokens
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE id = $1 AND business_partner_id = $2
      RETURNING id::text, name, revoked_at
    `, [req.params.tokenId, req.user.business_partner_id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'API-Token nicht gefunden.' });
    await logActivity({
      userId: req.user.id,
      username: req.user.username,
      actionType: 'ACCOUNT_RADAR_API_TOKEN_REVOKED',
      status: 'success',
      targetId: result.rows[0].id,
      targetType: 'account_radar_api_token',
      details: { name: result.rows[0].name },
      ipAddress: req.ip,
    });
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: 'API-Token konnte nicht widerrufen werden.' });
  }
};

exports.listAccountsApi = async (req, res) => {
  const startedAt = Date.now();
  const id = requestId(req, res);
  let responseStatus = 200;
  try {
    const limit = boundedLimit(req.query.limit);
    const offset = Math.max(Number.parseInt(String(req.query.offset || 0), 10) || 0, 0);
    const updatedSince = parseUpdatedSince(req.query.updated_since);
    const [result, countResult] = await Promise.all([
      db.query(`
        SELECT account.id::text, account.external_id, account.name, account.website_url,
               account.linkedin_url, account.logo_url, account.industry, account.status,
               account.notes, account.is_active, account.address, account.contact_email,
               account.contact_phone, account.owner_user_id::text, owner.email AS owner_email,
               account.created_at, account.updated_at,
               GREATEST(
                 COALESCE(account.updated_at, account.created_at),
                 COALESCE(MAX(contact.updated_at), COALESCE(account.updated_at, account.created_at))
               ) AS sync_updated_at,
               COALESCE(json_agg(json_build_object(
                 'id', contact.id::text, 'external_id', contact.external_id, 'name', contact.name,
                 'job_title', contact.job_title, 'email', contact.email, 'phone', contact.phone,
                 'linkedin_url', contact.linkedin_url, 'notes', contact.notes, 'is_primary', contact.is_primary,
                 'updated_at', contact.updated_at
               ) ORDER BY contact.is_primary DESC, contact.name) FILTER (WHERE contact.id IS NOT NULL), '[]'::json) AS contacts
        FROM business_partner_accounts account
        LEFT JOIN users owner ON owner.id = account.owner_user_id
        LEFT JOIN business_partner_account_contacts contact ON contact.account_id = account.id
        WHERE account.business_partner_id = $1
        GROUP BY account.id, owner.email
        HAVING $2::timestamptz IS NULL
          OR GREATEST(
            COALESCE(account.updated_at, account.created_at),
            COALESCE(MAX(contact.updated_at), COALESCE(account.updated_at, account.created_at))
          ) >= $2::timestamptz
        ORDER BY sync_updated_at, account.id
        LIMIT $3 OFFSET $4
      `, [req.integration.businessPartnerId, updatedSince, limit, offset]),
      db.query(`
        SELECT COUNT(*)::int AS count
        FROM business_partner_accounts
        WHERE business_partner_id = $1
          AND (
            $2::timestamptz IS NULL
            OR updated_at >= $2::timestamptz
            OR EXISTS (
              SELECT 1 FROM business_partner_account_contacts contact
              WHERE contact.account_id = business_partner_accounts.id
                AND contact.updated_at >= $2::timestamptz
            )
          )
      `, [req.integration.businessPartnerId, updatedSince]),
    ]);
    const total = Number(countResult.rows[0]?.count || 0);
    return res.json({ data: result.rows, meta: { total, limit, offset, hasMore: offset + result.rows.length < total } });
  } catch (error) {
    responseStatus = error.statusCode || 500;
    return apiError(res, error);
  } finally {
    await logApiSync({ businessPartnerId: req.integration.businessPartnerId, tokenId: req.integration.tokenId, operation: 'list', resourceType: 'accounts', responseStatus, durationMs: Date.now() - startedAt, requestId: id });
  }
};

const normalizeAccountApiPayload = (body) => {
  const name = normalizeOptionalText(body?.name, 255);
  if (!name) {
    const error = new Error('Account-Name ist erforderlich.');
    error.statusCode = 400;
    throw error;
  }
  const contacts = body?.contacts === undefined ? null : body.contacts;
  if (contacts !== null && (!Array.isArray(contacts) || contacts.length > 50)) {
    const error = new Error('contacts muss eine Liste mit maximal 50 Einträgen sein.');
    error.statusCode = 400;
    throw error;
  }
  return {
    name,
    websiteUrl: normalizeOptionalUrl(body.website_url, 'Website-URL'),
    linkedinUrl: normalizeOptionalUrl(body.linkedin_url, 'LinkedIn-URL'),
    logoUrl: normalizeOptionalUrl(body.logo_url, 'Logo-URL'),
    industry: normalizeOptionalText(body.industry, 255),
    status: enumValue(body.status, ACCOUNT_STATUSES, 'Account-Status', 'prospect'),
    notes: normalizeOptionalText(body.notes, 2000),
    isActive: body.is_active === undefined ? true : body.is_active === true,
    address: normalizeOptionalText(body.address, 1000),
    contactEmail: normalizeOptionalEmail(body.contact_email),
    contactPhone: normalizeOptionalText(body.contact_phone, 80),
    ownerEmail: normalizeOptionalEmail(body.owner_email),
    contacts,
  };
};

exports.upsertAccountApi = async (req, res) => {
  const startedAt = Date.now();
  const id = requestId(req, res);
  let responseStatus = 200;
  let externalId = null;
  const client = await db.connect();
  try {
    externalId = normalizeExternalId(req.params.externalId, 'Account external_id');
    const payload = normalizeAccountApiPayload(req.body);
    await client.query('BEGIN');
    const existing = await client.query(`
      SELECT id::text FROM business_partner_accounts
      WHERE business_partner_id = $1 AND external_id = $2
      FOR UPDATE
    `, [req.integration.businessPartnerId, externalId]);
    if (!existing.rows[0]) await assertAccountCapacity(client, req.integration.businessPartnerId, 1);

    let ownerId = null;
    if (payload.ownerEmail) {
      const owner = await client.query(`
        SELECT id::text FROM users
        WHERE business_partner_id = $1 AND LOWER(email) = $2 AND is_active = TRUE
          AND LOWER(role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user')
        LIMIT 1
      `, [req.integration.businessPartnerId, payload.ownerEmail]);
      if (!owner.rows[0]) {
        const error = new Error('owner_email gehört nicht zum aktiven Sales-Team dieses Mandanten.');
        error.statusCode = 400;
        throw error;
      }
      ownerId = owner.rows[0].id;
    }

    const accountResult = existing.rows[0]
      ? await client.query(`
          UPDATE business_partner_accounts SET
            name = $3, website_url = $4, linkedin_url = $5, logo_url = $6, industry = $7,
            status = $8, notes = $9, is_active = $10, address = $11, contact_email = $12,
            contact_phone = $13, owner_user_id = $14, updated_at = CURRENT_TIMESTAMP
          WHERE business_partner_id = $1 AND external_id = $2
          RETURNING *
        `, [req.integration.businessPartnerId, externalId, payload.name, payload.websiteUrl, payload.linkedinUrl,
          payload.logoUrl, payload.industry, payload.status, payload.notes, payload.isActive, payload.address,
          payload.contactEmail, payload.contactPhone, ownerId])
      : await client.query(`
          INSERT INTO business_partner_accounts
              (business_partner_id, external_id, name, website_url, linkedin_url, logo_url, industry,
               status, notes, is_active, address, contact_email, contact_phone, owner_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `, [req.integration.businessPartnerId, externalId, payload.name, payload.websiteUrl, payload.linkedinUrl,
          payload.logoUrl, payload.industry, payload.status, payload.notes, payload.isActive, payload.address,
          payload.contactEmail, payload.contactPhone, ownerId]);
    const account = accountResult.rows[0];

    if (payload.contacts !== null) {
      const primaryCount = payload.contacts.filter((contact) => contact?.is_primary === true).length;
      if (primaryCount > 1) {
        const error = new Error('Pro Account darf nur ein Primärkontakt übertragen werden.');
        error.statusCode = 400;
        throw error;
      }
      if (primaryCount === 1) {
        await client.query('UPDATE business_partner_account_contacts SET is_primary = FALSE WHERE account_id = $1', [account.id]);
      }
      for (const rawContact of payload.contacts) {
        const contactExternalId = normalizeExternalId(rawContact?.external_id, 'Kontakt external_id');
        const contactName = normalizeOptionalText(rawContact?.name, 200);
        if (!contactName) {
          const error = new Error('Jeder Kontakt benötigt einen Namen.');
          error.statusCode = 400;
          throw error;
        }
        const contactPayload = [
          contactName,
          normalizeOptionalText(rawContact.job_title, 200),
          normalizeOptionalEmail(rawContact.email),
          normalizeOptionalText(rawContact.phone, 80),
          normalizeOptionalUrl(rawContact.linkedin_url, 'Kontakt-LinkedIn-URL'),
          normalizeOptionalText(rawContact.notes, 2000),
          rawContact.is_primary === true,
        ];
        const contactExisting = await client.query(
          'SELECT id FROM business_partner_account_contacts WHERE account_id = $1 AND external_id = $2 FOR UPDATE',
          [account.id, contactExternalId]
        );
        if (contactExisting.rows[0]) {
          await client.query(`
            UPDATE business_partner_account_contacts SET
              name = $3, job_title = $4, email = $5, phone = $6, linkedin_url = $7,
              notes = $8, is_primary = $9, updated_at = CURRENT_TIMESTAMP
            WHERE account_id = $1 AND external_id = $2
          `, [account.id, contactExternalId, ...contactPayload]);
        } else {
          await client.query(`
            INSERT INTO business_partner_account_contacts
                (account_id, external_id, name, job_title, email, phone, linkedin_url, notes, is_primary)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [account.id, contactExternalId, ...contactPayload]);
        }
      }
    }

    await client.query('COMMIT');
    responseStatus = existing.rows[0] ? 200 : 201;
    return res.status(responseStatus).json({ data: { ...account, owner_email: payload.ownerEmail } });
  } catch (error) {
    await client.query('ROLLBACK');
    responseStatus = error.statusCode || (error.code === '23505' ? 409 : 500);
    if (error.code === '23505') {
      error.statusCode = 409;
      error.message = 'Die externe ID ist für diesen Mandanten bereits vergeben.';
    }
    return apiError(res, error);
  } finally {
    client.release();
    await logApiSync({ businessPartnerId: req.integration.businessPartnerId, tokenId: req.integration.tokenId, operation: 'upsert', resourceType: 'accounts', externalId, responseStatus, durationMs: Date.now() - startedAt, requestId: id });
  }
};

exports.listTasksApi = async (req, res) => {
  const startedAt = Date.now();
  const id = requestId(req, res);
  let responseStatus = 200;
  try {
    const limit = boundedLimit(req.query.limit);
    const offset = Math.max(Number.parseInt(String(req.query.offset || 0), 10) || 0, 0);
    const updatedSince = parseUpdatedSince(req.query.updated_since);
    const [result, countResult] = await Promise.all([
      db.query(`
        SELECT task.id::text, task.external_id, task.tracked_article_id::text AS signal_id,
               account.id::text AS account_id, account.external_id AS account_external_id, account.name AS account_name,
               article.article_title AS signal_title, article.article_url AS signal_url,
               task.task_status, task.sales_stage, task.priority, task.opportunity_value_eur,
               task.opportunity_probability, task.first_contact_at, task.action_type, task.follow_up_at,
               assigned.email AS assigned_user_email, contact.external_id AS contact_external_id,
               contact.name AS contact_name, task.contact_channel, task.note, task.completed_at,
               task.created_at, task.updated_at
        FROM account_radar_tasks task
        JOIN business_partner_tracked_articles article ON article.id = task.tracked_article_id
        JOIN business_partner_accounts account ON account.id = article.account_id
        LEFT JOIN users assigned ON assigned.id = task.assigned_user_id
        LEFT JOIN business_partner_account_contacts contact ON contact.id = task.contact_id
        WHERE task.business_partner_id = $1
          AND task.task_status <> 'cancelled'
          AND ($2::timestamptz IS NULL OR task.updated_at >= $2::timestamptz)
        ORDER BY task.updated_at, task.id
        LIMIT $3 OFFSET $4
      `, [req.integration.businessPartnerId, updatedSince, limit, offset]),
      db.query(`
        SELECT COUNT(*)::int AS count FROM account_radar_tasks
        WHERE business_partner_id = $1 AND task_status <> 'cancelled'
          AND ($2::timestamptz IS NULL OR updated_at >= $2::timestamptz)
      `, [req.integration.businessPartnerId, updatedSince]),
    ]);
    const total = Number(countResult.rows[0]?.count || 0);
    return res.json({ data: result.rows, meta: { total, limit, offset, hasMore: offset + result.rows.length < total } });
  } catch (error) {
    responseStatus = error.statusCode || 500;
    return apiError(res, error);
  } finally {
    await logApiSync({ businessPartnerId: req.integration.businessPartnerId, tokenId: req.integration.tokenId, operation: 'list', resourceType: 'tasks', responseStatus, durationMs: Date.now() - startedAt, requestId: id });
  }
};

exports.upsertTaskApi = async (req, res) => {
  const startedAt = Date.now();
  const id = requestId(req, res);
  let responseStatus = 200;
  let externalId = null;
  const client = await db.connect();
  try {
    externalId = normalizeExternalId(req.params.externalId, 'Aufgabe external_id');
    const signalId = String(req.body?.signal_id || '').trim();
    if (!UUID_PATTERN.test(signalId)) {
      const error = new Error('signal_id muss eine gültige Signal-UUID sein.');
      error.statusCode = 400;
      throw error;
    }
    let taskStatus = enumValue(req.body?.task_status, TASK_STATUSES, 'Aufgabenstatus', 'open');
    const salesStage = enumValue(req.body?.sales_stage, SALES_STAGES, 'Vertriebsphase', null);
    const priority = enumValue(req.body?.priority, PRIORITIES, 'Priorität', 'normal');
    const actionType = enumValue(req.body?.action_type, ACTION_TYPES, 'Aktion', null);
    const contactChannel = enumValue(req.body?.contact_channel, CONTACT_CHANNELS, 'Kontaktkanal', null);
    const followUpAt = optionalDate(req.body?.follow_up_at, 'follow_up_at');
    const opportunityValue = optionalNumber(req.body?.opportunity_value_eur, 'opportunity_value_eur', 0, 100000000);
    let probability = optionalNumber(req.body?.opportunity_probability, 'opportunity_probability', 0, 100, true);
    if (probability === null && salesStage) probability = ({ contacted: 20, meeting: 40, offer: 70, won: 100, lost: 0 })[salesStage];
    if (salesStage === 'won') probability = 100;
    if (salesStage === 'lost') probability = 0;
    if (['won', 'lost'].includes(salesStage)) taskStatus = 'done';
    if (actionType && !followUpAt) {
      const error = new Error('Für eine Aktion ist follow_up_at erforderlich.');
      error.statusCode = 400;
      throw error;
    }
    if (actionType === 'contact_planned' && !contactChannel) {
      const error = new Error('Für contact_planned ist contact_channel erforderlich.');
      error.statusCode = 400;
      throw error;
    }

    await client.query('BEGIN');
    const signal = await client.query(`
      SELECT article.id::text, article.account_id::text
      FROM business_partner_tracked_articles article
      JOIN business_partner_accounts account ON account.id = article.account_id
      WHERE article.id = $1 AND account.business_partner_id = $2
    `, [signalId, req.integration.businessPartnerId]);
    if (!signal.rows[0]) {
      const error = new Error('Signal wurde für diesen Mandanten nicht gefunden.');
      error.statusCode = 404;
      throw error;
    }
    let assigneeId = null;
    const assigneeEmail = normalizeOptionalEmail(req.body?.assigned_user_email);
    if (assigneeEmail) {
      const assignee = await client.query(`
        SELECT id::text FROM users WHERE business_partner_id = $1 AND LOWER(email) = $2
          AND is_active = TRUE AND LOWER(role) IN ('admin', 'assistenz', 'sales_manager', 'sales_user') LIMIT 1
      `, [req.integration.businessPartnerId, assigneeEmail]);
      if (!assignee.rows[0]) {
        const error = new Error('assigned_user_email gehört nicht zum aktiven Sales-Team dieses Mandanten.');
        error.statusCode = 400;
        throw error;
      }
      assigneeId = assignee.rows[0].id;
    }
    let contactId = null;
    if (req.body?.contact_external_id) {
      const contactExternalId = normalizeExternalId(req.body.contact_external_id, 'Kontakt external_id');
      const contact = await client.query(`
        SELECT contact.id::text
        FROM business_partner_account_contacts contact
        WHERE contact.account_id = $1 AND contact.external_id = $2
      `, [signal.rows[0].account_id, contactExternalId]);
      if (!contact.rows[0]) {
        const error = new Error('contact_external_id gehört nicht zum Account dieses Signals.');
        error.statusCode = 400;
        throw error;
      }
      contactId = contact.rows[0].id;
    }
    const existing = await client.query(`
      SELECT id::text, tracked_article_id::text
      FROM account_radar_tasks
      WHERE business_partner_id = $1 AND (external_id = $2 OR tracked_article_id = $3)
      FOR UPDATE
    `, [req.integration.businessPartnerId, externalId, signalId]);
    if (existing.rows.length > 1 || (existing.rows[0] && existing.rows[0].tracked_article_id !== signalId)) {
      const error = new Error('external_id und signal_id verweisen auf unterschiedliche Aufgaben.');
      error.statusCode = 409;
      throw error;
    }
    const taskResult = await client.query(`
      INSERT INTO account_radar_tasks (
        business_partner_id, tracked_article_id, external_id, assigned_user_id, action_type,
        follow_up_at, contact_id, contact_channel, note, sales_stage, sales_stage_updated_at,
        priority, opportunity_value_eur, opportunity_probability, first_contact_at, task_status, completed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        CASE WHEN $10::text IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
        $11, $12, $13, CASE WHEN $10::text IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
        $14, CASE WHEN $14 = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      ON CONFLICT (tracked_article_id) DO UPDATE SET
        external_id = EXCLUDED.external_id,
        assigned_user_id = EXCLUDED.assigned_user_id,
        action_type = EXCLUDED.action_type,
        follow_up_at = EXCLUDED.follow_up_at,
        contact_id = EXCLUDED.contact_id,
        contact_channel = EXCLUDED.contact_channel,
        note = EXCLUDED.note,
        sales_stage = EXCLUDED.sales_stage,
        sales_stage_updated_at = CASE WHEN account_radar_tasks.sales_stage IS DISTINCT FROM EXCLUDED.sales_stage THEN CURRENT_TIMESTAMP ELSE account_radar_tasks.sales_stage_updated_at END,
        priority = EXCLUDED.priority,
        opportunity_value_eur = EXCLUDED.opportunity_value_eur,
        opportunity_probability = EXCLUDED.opportunity_probability,
        first_contact_at = CASE WHEN account_radar_tasks.first_contact_at IS NULL AND EXCLUDED.sales_stage IS NOT NULL THEN CURRENT_TIMESTAMP ELSE account_radar_tasks.first_contact_at END,
        task_status = EXCLUDED.task_status,
        completed_at = CASE WHEN EXCLUDED.task_status = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE account_radar_tasks.business_partner_id = $1
      RETURNING *
    `, [req.integration.businessPartnerId, signalId, externalId, assigneeId, actionType, followUpAt,
      contactId, actionType === 'contact_planned' ? contactChannel : null, normalizeOptionalText(req.body?.note, 1500),
      salesStage, priority, opportunityValue, probability, taskStatus]);
    if (!taskResult.rows[0]) {
      const error = new Error('Die bestehende Aufgabe gehört nicht zu diesem Mandanten.');
      error.statusCode = 409;
      throw error;
    }
    await client.query(`
      INSERT INTO account_radar_task_events
          (task_id, business_partner_id, actor_user_id, event_type, event_data)
      VALUES ($1, $2, NULL, 'api_sync', $3::jsonb)
    `, [taskResult.rows[0].id, req.integration.businessPartnerId, JSON.stringify({ external_id: externalId, sales_stage: salesStage, task_status: taskStatus })]);
    await client.query('COMMIT');
    responseStatus = existing.rows[0] ? 200 : 201;
    return res.status(responseStatus).json({ data: taskResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    responseStatus = error.statusCode || (error.code === '23505' ? 409 : 500);
    if (error.code === '23505') {
      error.statusCode = 409;
      error.message = 'Die externe ID ist für diesen Mandanten bereits vergeben.';
    }
    return apiError(res, error);
  } finally {
    client.release();
    await logApiSync({ businessPartnerId: req.integration.businessPartnerId, tokenId: req.integration.tokenId, operation: 'upsert', resourceType: 'tasks', externalId, responseStatus, durationMs: Date.now() - startedAt, requestId: id });
  }
};

exports.getAnalyticsApi = async (req, res) => {
  const startedAt = Date.now();
  const id = requestId(req, res);
  let responseStatus = 200;
  try {
    return res.json({ data: await getAccountRadarAnalytics(req.integration.businessPartnerId, Number(req.query.period_days || 30)) });
  } catch (error) {
    responseStatus = 500;
    return apiError(res, error);
  } finally {
    await logApiSync({ businessPartnerId: req.integration.businessPartnerId, tokenId: req.integration.tokenId, operation: 'analytics', resourceType: 'analytics', responseStatus, durationMs: Date.now() - startedAt, requestId: id });
  }
};
