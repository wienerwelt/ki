const db = require('../config/db');
const { logActivity } = require('../services/auditLogService');
const { assertAccountCapacity, getBusinessPartnerSalesPlan } = require('../services/salesPlanService');
const {
  TRIGGER_TEMPLATES,
  assignMarketSignalToAccount,
  assertAccountsBelongToTenant,
  ensureTemplateProfiles,
  findContentTriggerMatches,
  importContentTriggerMatches,
  listMarketSignals,
  listTriggerProfiles,
  normalizeProfilePayload,
  updateMarketSignalStatus,
} = require('../services/accountRadarTriggerService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getTenantId = (req) => {
  const id = String(req.user?.business_partner_id || '').trim();
  if (!UUID_PATTERN.test(id)) {
    const error = new Error('Kein gültiger Mandant zugeordnet.');
    error.statusCode = 400;
    throw error;
  }
  return id;
};

const getProfile = async (queryable, businessPartnerId, profileId, forUpdate = false) => {
  if (!UUID_PATTERN.test(String(profileId || ''))) {
    const error = new Error('Ungültiger Sales-Trigger.');
    error.statusCode = 400;
    throw error;
  }
  const { rows } = await queryable.query(
    `SELECT * FROM account_radar_trigger_profiles
     WHERE id = $1 AND business_partner_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [profileId, businessPartnerId]
  );
  if (!rows.length) {
    const error = new Error('Sales-Trigger nicht gefunden.');
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
};

const getAccounts = async (queryable, businessPartnerId) => {
  const { rows } = await queryable.query(
    `SELECT account.id::text, account.name, account.logo_url,
            COUNT(competitor.id)::int AS competitor_count
     FROM business_partner_accounts account
     LEFT JOIN business_partner_competitors competitor ON competitor.account_id = account.id
     WHERE account.business_partner_id = $1 AND account.is_active = TRUE
     GROUP BY account.id
     ORDER BY lower(account.name)`,
    [businessPartnerId]
  );
  return rows;
};

const handleError = (res, error, context) => {
  console.error(`[AccountRadarTriggers] ${context}:`, error.message);
  if (error.code === '23505') {
    return res.status(409).json({ message: 'Ein Sales-Trigger mit diesem Namen besteht bereits.' });
  }
  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : 'Sales-Trigger konnten nicht verarbeitet werden.',
  });
};

const audit = (req, actionType, targetId, details = {}, targetType = 'account_radar_trigger_profile') => logActivity({
  userId: req.user?.id || null,
  username: req.user?.email || req.user?.username || 'System',
  actionType,
  status: 'success',
  targetId,
  targetType,
  details,
  ipAddress: req.ip || null,
});

exports.list = async (req, res) => {
  try {
    const businessPartnerId = getTenantId(req);
    const entitlements = await getBusinessPartnerSalesPlan(db, businessPartnerId);
    if (entitlements.features.contentTriggers) {
      await ensureTemplateProfiles(db, businessPartnerId, req.user?.id || null);
    }
    const [profiles, accounts] = await Promise.all([
      entitlements.features.contentTriggers ? listTriggerProfiles(db, businessPartnerId) : [],
      getAccounts(db, businessPartnerId),
    ]);
    return res.json({ templates: TRIGGER_TEMPLATES, profiles, accounts, entitlements });
  } catch (error) {
    return handleError(res, error, 'Liste');
  }
};

exports.listMarketSignals = async (req, res) => {
  try {
    const businessPartnerId = getTenantId(req);
    const result = await listMarketSignals(db, businessPartnerId, {
      limit: req.query.limit,
      status: req.query.status,
    });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, 'Markt- und Ereignistreffer');
  }
};

exports.assignMarketSignal = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    await client.query('BEGIN');
    const result = await assignMarketSignalToAccount(
      client,
      businessPartnerId,
      req.params.matchId,
      req.body?.account_id,
      req.user?.id || null
    );
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_MARKET_SIGNAL_ASSIGNED', req.params.matchId, {
      accountId: result.accountId,
      accountName: result.accountName,
    }, 'account_radar_market_signal');
    return res.json({
      message: `Der Treffer wurde „${result.accountName}“ zugeordnet und in den Account-Radar übernommen.`,
      ...result,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Account-Zuordnung');
  } finally {
    client.release();
  }
};

exports.createAccountFromMarketSignal = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    const name = String(req.body?.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 200) {
      const error = new Error('Der Account-Name muss zwischen 2 und 200 Zeichen enthalten.');
      error.statusCode = 400;
      throw error;
    }
    let websiteUrl = String(req.body?.website_url || '').trim() || null;
    if (websiteUrl) {
      if (!/^https?:\/\//i.test(websiteUrl)) websiteUrl = `https://${websiteUrl}`;
      try {
        const parsed = new URL(websiteUrl);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error('invalid');
        websiteUrl = parsed.toString();
      } catch (_) {
        const error = new Error('Die Website muss eine gültige HTTP-/HTTPS-Adresse sein.');
        error.statusCode = 400;
        throw error;
      }
    }
    await client.query('BEGIN');
    await assertAccountCapacity(client, businessPartnerId, 1);
    const duplicate = await client.query(
      `SELECT id::text, name
       FROM business_partner_accounts
       WHERE business_partner_id = $1
         AND (lower(trim(name)) = lower(trim($2))
              OR ($3::text IS NOT NULL AND website_url = $3))
       LIMIT 1`,
      [businessPartnerId, name, websiteUrl]
    );
    if (duplicate.rows[0]) {
      const error = new Error(`Der Account „${duplicate.rows[0].name}“ besteht bereits. Bitte ordnen Sie den Treffer diesem Account zu.`);
      error.statusCode = 409;
      throw error;
    }
    const accountResult = await client.query(
      `INSERT INTO business_partner_accounts
        (business_partner_id, name, website_url, status, notes)
       VALUES ($1, $2, $3, 'prospect', $4)
       RETURNING id::text, name`,
      [businessPartnerId, name, websiteUrl, 'Aus einem Trigger-Treffer angelegt.']
    );
    const account = accountResult.rows[0];
    const assignment = await assignMarketSignalToAccount(
      client,
      businessPartnerId,
      req.params.matchId,
      account.id,
      req.user?.id || null
    );
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_ACCOUNT_FROM_MARKET_SIGNAL_CREATED', account.id, {
      matchId: req.params.matchId,
      accountName: account.name,
    }, 'business_partner_account');
    return res.status(201).json({
      message: `„${account.name}“ wurde als Prospect angelegt und der Treffer in den Account-Radar übernommen.`,
      ...assignment,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Account aus Markt-Treffer anlegen');
  } finally {
    client.release();
  }
};

exports.updateMarketSignalStatus = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    await client.query('BEGIN');
    const result = await updateMarketSignalStatus(
      client,
      businessPartnerId,
      req.params.matchId,
      String(req.body?.status || ''),
      req.user?.id || null
    );
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_MARKET_SIGNAL_STATUS_CHANGED', req.params.matchId, { status: result.review_status }, 'account_radar_market_signal');
    return res.json({
      message: result.review_status === 'ignored' ? 'Treffer wurde als nicht relevant markiert.' : 'Treffer wurde wiederhergestellt.',
      signal: result,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Trefferstatus');
  } finally {
    client.release();
  }
};

exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    await client.query('BEGIN');
    const entitlements = await getBusinessPartnerSalesPlan(client, businessPartnerId, { forUpdate: true });
    const countResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM account_radar_trigger_profiles WHERE business_partner_id = $1',
      [businessPartnerId]
    );
    if (Number(countResult.rows[0]?.count || 0) >= entitlements.limits.triggerProfiles) {
      const error = new Error(`${entitlements.label} erlaubt maximal ${entitlements.limits.triggerProfiles} Sales-Trigger.`);
      error.statusCode = 409;
      throw error;
    }
    const normalized = normalizeProfilePayload({ ...req.body, template_key: null });
    await assertAccountsBelongToTenant(client, businessPartnerId, normalized.accountIds);
    const { rows } = await client.query(
      `INSERT INTO account_radar_trigger_profiles
        (business_partner_id, name, description, is_active, include_keywords, exclude_keywords,
         scope_mode, account_ids, include_competitors, lookback_days, min_content_relevance,
         created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::uuid[], $9, $10, $11, $12, $12)
       RETURNING *`,
      [businessPartnerId, normalized.name, normalized.description, normalized.isActive,
        normalized.includeKeywords, normalized.excludeKeywords, normalized.scopeMode, normalized.accountIds,
        normalized.includeCompetitors, normalized.lookbackDays, normalized.minContentRelevance,
        req.user?.id || null]
    );
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_TRIGGER_CREATED', rows[0].id, { name: rows[0].name });
    return res.status(201).json({ profile: rows[0] });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Anlegen');
  } finally {
    client.release();
  }
};

exports.update = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    await client.query('BEGIN');
    const existing = await getProfile(client, businessPartnerId, req.params.profileId, true);
    const normalized = normalizeProfilePayload({ ...req.body, template_key: existing.template_key }, existing);
    await assertAccountsBelongToTenant(client, businessPartnerId, normalized.accountIds);
    const { rows } = await client.query(
      `UPDATE account_radar_trigger_profiles
       SET name = $3, description = $4, is_active = $5, include_keywords = $6::text[],
           exclude_keywords = $7::text[], scope_mode = $8, account_ids = $9::uuid[], include_competitors = $10,
           lookback_days = $11, min_content_relevance = $12, updated_by_user_id = $13,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND business_partner_id = $2
       RETURNING *`,
      [existing.id, businessPartnerId, normalized.name, normalized.description, normalized.isActive,
        normalized.includeKeywords, normalized.excludeKeywords, normalized.scopeMode, normalized.accountIds,
        normalized.includeCompetitors, normalized.lookbackDays, normalized.minContentRelevance,
        req.user?.id || null]
    );
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_TRIGGER_UPDATED', existing.id, {
      name: rows[0].name,
      active: rows[0].is_active,
    });
    return res.json({ profile: rows[0] });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Aktualisieren');
  } finally {
    client.release();
  }
};

exports.remove = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    await client.query('BEGIN');
    const existing = await getProfile(client, businessPartnerId, req.params.profileId, true);
    if (existing.template_key) {
      const template = TRIGGER_TEMPLATES.find((entry) => entry.key === existing.template_key);
      await client.query(
        `UPDATE account_radar_trigger_profiles
         SET name = $3, description = $4, is_active = FALSE, include_keywords = $5::text[],
             exclude_keywords = $6::text[], scope_mode = 'all', account_ids = ARRAY[]::uuid[], include_competitors = FALSE,
             lookback_days = 30, min_content_relevance = 0, updated_by_user_id = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND business_partner_id = $2`,
        [existing.id, businessPartnerId, template.name, template.description, template.keywords,
          template.excludedKeywords, req.user?.id || null]
      );
    } else {
      await client.query(
        'DELETE FROM account_radar_trigger_profiles WHERE id = $1 AND business_partner_id = $2',
        [existing.id, businessPartnerId]
      );
    }
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_TRIGGER_REMOVED', existing.id, {
      name: existing.name,
      resetTemplate: Boolean(existing.template_key),
    });
    return res.status(204).send();
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Löschen');
  } finally {
    client.release();
  }
};

exports.preview = async (req, res) => {
  try {
    const businessPartnerId = getTenantId(req);
    let payload = req.body || {};
    if (payload.profile_id) {
      const existing = await getProfile(db, businessPartnerId, payload.profile_id);
      payload = { ...existing, ...payload, template_key: existing.template_key };
    }
    const result = await findContentTriggerMatches(db, businessPartnerId, payload, { limit: 50 });
    return res.json({
      scanned: result.scanned,
      accountCount: result.accountCount,
      scopeMode: result.profile.scopeMode,
      keywordMatchesWithoutAccount: result.keywordMatchesWithoutAccount,
      unassignedKeywordMatches: result.unassignedKeywordMatches.map(({ content_id, ...match }) => match),
      limitReached: result.limitReached,
      matches: result.matches.map(({ content_id, ...match }) => match),
    });
  } catch (error) {
    return handleError(res, error, 'Vorschau');
  }
};

exports.run = async (req, res) => {
  const client = await db.connect();
  try {
    const businessPartnerId = getTenantId(req);
    await client.query('BEGIN');
    const profile = await getProfile(client, businessPartnerId, req.params.profileId, true);
    const result = await importContentTriggerMatches(client, businessPartnerId, profile, { limit: 200 });
    await client.query('COMMIT');
    await audit(req, 'ACCOUNT_RADAR_TRIGGER_RUN', profile.id, {
      name: profile.name,
      matches: result.matches.length,
      inserted: result.inserted,
    });
    return res.json({
      message: result.inserted
        ? result.profile.scopeMode === 'unassigned'
          ? `${result.inserted} neue Markt-/Ereignistreffer wurden gespeichert.`
          : `${result.inserted} neue Signale wurden in den Account-Radar übernommen.`
        : result.matches.length
          ? result.profile.scopeMode === 'unassigned'
            ? `${result.matches.length} passende Markt-/Ereignistreffer waren bereits gespeichert.`
            : `${result.matches.length} passende Inhalte waren bereits im Account-Radar vorhanden.`
          : result.profile.scopeMode === 'unassigned'
            ? `Keine passenden Markt-/Ereignistreffer gefunden. ${result.scanned} Inhalte wurden geprüft.`
            : `Keine passenden Signale gefunden. ${result.scanned} Inhalte wurden geprüft.${result.keywordMatchesWithoutAccount ? ` ${result.keywordMatchesWithoutAccount} Trigger-Begriff-Treffer konnten keinem angelegten Account zugeordnet werden.` : ''}`,
      matches: result.matches.length,
      inserted: result.inserted,
      linked: result.linked,
      scanned: result.scanned,
      scopeMode: result.profile.scopeMode,
      keywordMatchesWithoutAccount: result.keywordMatchesWithoutAccount,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return handleError(res, error, 'Übernahme');
  } finally {
    client.release();
  }
};
