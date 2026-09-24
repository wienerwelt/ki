const db = require('../config/db');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_LOOKBACK_DAYS = new Set([7, 30, 90, 365]);
const ALLOWED_SCOPE_MODES = new Set(['unassigned', 'all', 'selected']);

const TRIGGER_TEMPLATES = Object.freeze([
  {
    key: 'personnel_change',
    name: 'Personalwechsel',
    description: 'Neue Verantwortliche, Ernennungen, Beförderungen und Wechsel im Management.',
    keywords: ['neuer geschäftsführer', 'neue geschäftsführerin', 'übernimmt die leitung', 'wird geschäftsführer', 'wird geschäftsführerin', 'personalwechsel', 'neu im team', 'wechselt zu', 'ernannt', 'befördert'],
    excludedKeywords: ['sport', 'trainerwechsel'],
  },
  {
    key: 'investment_growth',
    name: 'Investition & Wachstum',
    description: 'Investitionen, Expansion, neue Standorte und größere Beschaffungsvorhaben.',
    keywords: ['investiert', 'investition', 'millionen euro', 'neuer standort', 'standorterweiterung', 'expansion', 'ausbau', 'erweitert kapazität', 'beschaffung'],
    excludedKeywords: [],
  },
  {
    key: 'fleet_mobility',
    name: 'Fuhrpark & Mobilität',
    description: 'Flottenausbau, Mobilitätsprojekte, Leasing und neue Fahrzeugkonzepte.',
    keywords: ['fuhrpark', 'flotte', 'fleet', 'dienstwagen', 'nutzfahrzeuge', 'mobilitätskonzept', 'leasingflotte', 'fahrzeugflotte'],
    excludedKeywords: ['modellvorstellung', 'privatkunden'],
  },
  {
    key: 'charging_emobility',
    name: 'Ladeinfrastruktur & E-Mobilität',
    description: 'Ladeparks, Depotladen und die Elektrifizierung betrieblicher Flotten.',
    keywords: ['ladeinfrastruktur', 'ladepark', 'ladepunkte', 'depotladen', 'wallboxen', 'elektrifiziert die flotte', 'e-fuhrpark', 'elektrische dienstwagen'],
    excludedKeywords: ['private wallbox', 'privathaushalt'],
  },
  {
    key: 'partnership',
    name: 'Partnerschaft & Kooperation',
    description: 'Neue Partnerschaften, Kooperationen, Pilotprojekte und strategische Allianzen.',
    keywords: ['kooperation', 'partnerschaft', 'strategische allianz', 'pilotprojekt', 'joint venture', 'zusammenarbeit mit'],
    excludedKeywords: [],
  },
  {
    key: 'regulation_compliance',
    name: 'Regulatorik & Compliance',
    description: 'Regulatorische Änderungen mit Handlungsdruck für Flotte, Mobilität oder Energie.',
    keywords: ['neue verordnung', 'gesetzesänderung', 'regulatorische anforderung', 'compliance', 'co2-vorgaben', 'mautänderung', 'berichtspflicht'],
    excludedKeywords: [],
  },
  {
    key: 'restructuring',
    name: 'Restrukturierung & Risiko',
    description: 'Restrukturierungen, Kostensenkungen, Insolvenzen und organisatorische Veränderungen.',
    keywords: ['restrukturierung', 'stellenabbau', 'kostensenkungsprogramm', 'insolvenz', 'sanierung', 'schließt standort', 'strategische neuausrichtung'],
    excludedKeywords: [],
  },
]);

const normalizeComparable = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeTermList = (value, label, { required = false } = {}) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,;]/);
  const normalized = Array.from(new Set(source
    .map((term) => String(term || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)));
  if (normalized.length > 25) {
    const error = new Error(`${label} darf maximal 25 Begriffe enthalten.`);
    error.statusCode = 400;
    throw error;
  }
  if (normalized.some((term) => term.length < 2 || term.length > 80)) {
    const error = new Error(`${label} muss aus Begriffen mit 2 bis 80 Zeichen bestehen.`);
    error.statusCode = 400;
    throw error;
  }
  if (required && normalized.length === 0) {
    const error = new Error('Mindestens ein Suchbegriff ist erforderlich.');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

const normalizeProfilePayload = (payload = {}, existing = null) => {
  const templateKey = payload.template_key === undefined
    ? existing?.template_key || null
    : String(payload.template_key || '').trim() || null;
  const template = TRIGGER_TEMPLATES.find((entry) => entry.key === templateKey) || null;
  if (templateKey && !template) {
    const error = new Error('Die ausgewählte feste Kategorie ist ungültig.');
    error.statusCode = 400;
    throw error;
  }
  const name = String(payload.name ?? existing?.name ?? template?.name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = String(payload.description ?? existing?.description ?? template?.description ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 120) {
    const error = new Error('Der Name des Sales-Triggers muss zwischen 2 und 120 Zeichen enthalten.');
    error.statusCode = 400;
    throw error;
  }
  if (description.length > 500) {
    const error = new Error('Die Beschreibung darf maximal 500 Zeichen enthalten.');
    error.statusCode = 400;
    throw error;
  }

  const suppliedIncludeKeywords = payload.include_keywords ?? existing?.include_keywords ?? template?.keywords ?? [];
  const includeKeywords = normalizeTermList(
    template ? [...template.keywords, ...(Array.isArray(suppliedIncludeKeywords) ? suppliedIncludeKeywords : String(suppliedIncludeKeywords || '').split(/[\n,;]/))] : suppliedIncludeKeywords,
    'Die Suchbegriffe',
    { required: true }
  );
  const excludeKeywords = normalizeTermList(
    payload.exclude_keywords ?? existing?.exclude_keywords ?? template?.excludedKeywords ?? [],
    'Die Ausschlussbegriffe'
  );
  const requestedScopeMode = String(payload.scope_mode ?? existing?.scope_mode ?? '').trim();
  const scopeMode = requestedScopeMode || (
    (Array.isArray(payload.account_ids) ? payload.account_ids : existing?.account_ids || []).length
      ? 'selected'
      : 'all'
  );
  if (!ALLOWED_SCOPE_MODES.has(scopeMode)) {
    const error = new Error('Der Gültigkeitsbereich des Sales-Triggers ist ungültig.');
    error.statusCode = 400;
    throw error;
  }
  const suppliedAccountIds = Array.from(new Set(
    (Array.isArray(payload.account_ids) ? payload.account_ids : existing?.account_ids || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ));
  const accountIds = scopeMode === 'selected' ? suppliedAccountIds : [];
  if (accountIds.length > 500 || accountIds.some((id) => !UUID_PATTERN.test(id))) {
    const error = new Error('Die Account-Auswahl ist ungültig oder zu groß.');
    error.statusCode = 400;
    throw error;
  }
  const lookbackDays = Number(payload.lookback_days ?? existing?.lookback_days ?? 30);
  const minContentRelevance = Number(payload.min_content_relevance ?? existing?.min_content_relevance ?? 0);
  if (!ALLOWED_LOOKBACK_DAYS.has(lookbackDays)) {
    const error = new Error('Der Prüfzeitraum muss 7, 30, 90 oder 365 Tage betragen.');
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(minContentRelevance) || minContentRelevance < 0 || minContentRelevance > 100) {
    const error = new Error('Die Mindest-Relevanz muss zwischen 0 und 100 liegen.');
    error.statusCode = 400;
    throw error;
  }
  if (scopeMode === 'selected' && accountIds.length === 0) {
    const error = new Error('Für „Ausgewählte Accounts“ muss mindestens ein Account ausgewählt sein.');
    error.statusCode = 400;
    throw error;
  }
  return {
    templateKey,
    name,
    description: description || null,
    isActive: payload.is_active === undefined ? existing?.is_active === true : payload.is_active === true,
    includeKeywords,
    excludeKeywords,
    scopeMode,
    accountIds,
    includeCompetitors: scopeMode === 'unassigned' ? false : payload.include_competitors === undefined
      ? existing?.include_competitors === true
      : payload.include_competitors === true,
    lookbackDays,
    minContentRelevance,
  };
};

async function ensureTemplateProfiles(queryable, businessPartnerId, userId = null) {
  for (const template of TRIGGER_TEMPLATES) {
    await queryable.query(
      `INSERT INTO account_radar_trigger_profiles
        (business_partner_id, template_key, name, description, include_keywords, exclude_keywords,
         created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $7)
       ON CONFLICT (business_partner_id, template_key) WHERE template_key IS NOT NULL DO NOTHING`,
      [businessPartnerId, template.key, template.name, template.description, template.keywords, template.excludedKeywords, userId]
    );
  }
}

async function listTriggerProfiles(queryable, businessPartnerId) {
  const { rows } = await queryable.query(
    `SELECT profile.*,
            COALESCE(match_stats.match_count, 0)::int AS match_count,
            match_stats.last_match_at,
            COALESCE(market_stats.recent_market_matches, '[]'::json) AS recent_market_matches
     FROM account_radar_trigger_profiles profile
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS match_count, MAX(created_at) AS last_match_at
       FROM account_radar_content_trigger_matches match
       WHERE match.trigger_profile_id = profile.id
     ) match_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT json_agg(recent_match ORDER BY recent_match.created_at DESC) AS recent_market_matches
       FROM (
         SELECT content.title, content.original_url,
                COALESCE(content.published_date, content.created_at::date) AS published_at,
                match.matched_keywords, match.match_score, match.created_at
         FROM account_radar_content_trigger_matches match
         JOIN scraped_content content ON content.id = match.scraped_content_id
         WHERE match.trigger_profile_id = profile.id
           AND match.account_id IS NULL
         ORDER BY match.created_at DESC
         LIMIT 5
       ) recent_match
     ) market_stats ON TRUE
     WHERE profile.business_partner_id = $1
     ORDER BY (profile.template_key IS NULL), profile.name`,
    [businessPartnerId]
  );
  return rows;
}

async function listMarketSignals(queryable, businessPartnerId, options = {}) {
  const requestedLimit = Number(options.limit || 12);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 12, 1), 50);
  const reviewStatus = options.status === 'ignored' ? 'ignored' : 'new';
  const [{ rows }, countResult] = await Promise.all([queryable.query(
    `SELECT market_signal.*, COUNT(*) OVER()::int AS total_count
     FROM (
       SELECT DISTINCT ON (lower(trim(COALESCE(content.title, ''))))
              match.id::text,
              profile.id::text AS trigger_profile_id,
              profile.name AS trigger_profile_name,
              profile.template_key AS trigger_template_key,
              profile.is_active AS trigger_profile_active,
              content.title,
              content.summary,
              content.original_url,
              content.source_identifier,
              COALESCE(content.published_date, content.created_at::date) AS published_at,
              content.category,
              content.region,
              match.matched_keywords,
              match.match_score,
              match.review_status,
              match.created_at AS discovered_at
       FROM account_radar_content_trigger_matches match
       JOIN account_radar_trigger_profiles profile ON profile.id = match.trigger_profile_id
       JOIN scraped_content content ON content.id = match.scraped_content_id
       WHERE match.business_partner_id = $1
         AND match.account_id IS NULL
         AND match.review_status = $3
       ORDER BY lower(trim(COALESCE(content.title, ''))),
                COALESCE(content.published_date, content.created_at::date) DESC,
                match.created_at DESC
     ) market_signal
     ORDER BY market_signal.published_at DESC NULLS LAST, market_signal.discovered_at DESC
     LIMIT $2`,
    [businessPartnerId, limit, reviewStatus]
  ), queryable.query(
    `SELECT COUNT(*) FILTER (WHERE review_status = 'new')::int AS active,
            COUNT(*) FILTER (WHERE review_status = 'ignored')::int AS ignored
     FROM account_radar_content_trigger_matches
     WHERE business_partner_id = $1
       AND account_id IS NULL`,
    [businessPartnerId]
  )]);
  return {
    items: rows.map(({ total_count: _totalCount, ...item }) => item),
    total: Number(rows[0]?.total_count || 0),
    counts: {
      active: Number(countResult.rows[0]?.active || 0),
      ignored: Number(countResult.rows[0]?.ignored || 0),
    },
  };
}

async function getMarketSignal(queryable, businessPartnerId, matchId, { forUpdate = false } = {}) {
  if (!UUID_PATTERN.test(String(matchId || ''))) {
    const error = new Error('Ungültiger Markt-/Ereignistreffer.');
    error.statusCode = 400;
    throw error;
  }
  const { rows } = await queryable.query(
    `SELECT match.*, content.title, content.summary, content.original_url,
            content.source_identifier,
            COALESCE(content.published_date, content.created_at::date) AS published_at
     FROM account_radar_content_trigger_matches match
     JOIN scraped_content content ON content.id = match.scraped_content_id
     WHERE match.id = $1
       AND match.business_partner_id = $2
       AND match.account_id IS NULL${forUpdate ? ' FOR UPDATE OF match' : ''}`,
    [matchId, businessPartnerId]
  );
  if (!rows[0]) {
    const error = new Error('Markt-/Ereignistreffer nicht gefunden oder bereits zugeordnet.');
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
}

async function assignMarketSignalToAccount(queryable, businessPartnerId, matchId, accountId, userId = null) {
  if (!UUID_PATTERN.test(String(accountId || ''))) {
    const error = new Error('Bitte einen gültigen Account auswählen.');
    error.statusCode = 400;
    throw error;
  }
  const [match, accountResult] = await Promise.all([
    getMarketSignal(queryable, businessPartnerId, matchId, { forUpdate: true }),
    queryable.query(
      `SELECT id::text, name
       FROM business_partner_accounts
       WHERE id = $1 AND business_partner_id = $2 AND is_active = TRUE
       FOR UPDATE`,
      [accountId, businessPartnerId]
    ),
  ]);
  const account = accountResult.rows[0];
  if (!account) {
    const error = new Error('Der ausgewählte Account gehört nicht zum aktiven Mandantenbestand.');
    error.statusCode = 400;
    throw error;
  }

  const trackedResult = await queryable.query(
    `INSERT INTO business_partner_tracked_articles
      (account_id, article_title, article_url, source_name, published_at, summary)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_id, article_url) DO UPDATE SET
       source_name = COALESCE(business_partner_tracked_articles.source_name, EXCLUDED.source_name),
       published_at = COALESCE(business_partner_tracked_articles.published_at, EXCLUDED.published_at),
       summary = COALESCE(NULLIF(business_partner_tracked_articles.summary, ''), EXCLUDED.summary)
     RETURNING id::text`,
    [account.id, match.title, match.original_url, match.source_identifier, match.published_at, match.summary]
  );
  const trackedArticleId = trackedResult.rows[0].id;
  const existingResult = await queryable.query(
    `SELECT id::text
     FROM account_radar_content_trigger_matches
     WHERE trigger_profile_id = $1
       AND scraped_content_id = $2
       AND account_id = $3
       AND COALESCE(competitor_name, '') = ''
       AND id <> $4
     LIMIT 1
     FOR UPDATE`,
    [match.trigger_profile_id, match.scraped_content_id, account.id, match.id]
  );
  if (existingResult.rows[0]) {
    await queryable.query(
      `UPDATE account_radar_content_trigger_matches
       SET tracked_article_id = $2, review_status = 'assigned', reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by_user_id = $3
       WHERE id = $1`,
      [existingResult.rows[0].id, trackedArticleId, userId]
    );
    await queryable.query('DELETE FROM account_radar_content_trigger_matches WHERE id = $1', [match.id]);
  } else {
    await queryable.query(
      `UPDATE account_radar_content_trigger_matches
       SET account_id = $2, tracked_article_id = $3, review_status = 'assigned',
           reviewed_at = CURRENT_TIMESTAMP, reviewed_by_user_id = $4
       WHERE id = $1`,
      [match.id, account.id, trackedArticleId, userId]
    );
  }
  return { accountId: account.id, accountName: account.name, trackedArticleId };
}

async function updateMarketSignalStatus(queryable, businessPartnerId, matchId, status, userId = null) {
  if (!['new', 'ignored'].includes(status)) {
    const error = new Error('Der gewünschte Trefferstatus ist ungültig.');
    error.statusCode = 400;
    throw error;
  }
  await getMarketSignal(queryable, businessPartnerId, matchId, { forUpdate: true });
  const { rows } = await queryable.query(
    `UPDATE account_radar_content_trigger_matches
     SET review_status = $3, reviewed_at = CURRENT_TIMESTAMP, reviewed_by_user_id = $4
     WHERE id = $1 AND business_partner_id = $2
     RETURNING id::text, review_status`,
    [matchId, businessPartnerId, status, userId]
  );
  return rows[0];
}

async function assertAccountsBelongToTenant(queryable, businessPartnerId, accountIds) {
  if (!accountIds.length) return;
  const result = await queryable.query(
    `SELECT COUNT(*)::int AS count
     FROM business_partner_accounts
     WHERE business_partner_id = $1 AND id = ANY($2::uuid[])`,
    [businessPartnerId, accountIds]
  );
  if (Number(result.rows[0]?.count || 0) !== accountIds.length) {
    const error = new Error('Mindestens ein ausgewählter Account gehört nicht zu diesem Mandanten.');
    error.statusCode = 400;
    throw error;
  }
}

const getHost = (value) => {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    return '';
  }
};

const getEntityAliases = (name) => {
  const full = normalizeComparable(name);
  const short = full
    .replace(/\b(gmbh|ag|kg|og|se|e v|ev|inc|ltd|holding|group|gruppe)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(new Set([full, short].filter((entry) => entry.length >= 3)));
};

const textContainsAlias = (text, aliases) => {
  const padded = ` ${text} `;
  return aliases.some((alias) => padded.includes(` ${alias} `));
};

async function loadTriggerAccounts(queryable, businessPartnerId, profile) {
  if (profile.scopeMode === 'unassigned') return [];
  const accountResult = await queryable.query(
    `SELECT account.id::text, account.name, account.website_url,
            COALESCE(json_agg(json_build_object('name', competitor.name))
              FILTER (WHERE competitor.id IS NOT NULL), '[]'::json) AS competitors
     FROM business_partner_accounts account
     LEFT JOIN business_partner_competitors competitor ON competitor.account_id = account.id
     WHERE account.business_partner_id = $1
       AND account.is_active = TRUE
       AND (cardinality($2::uuid[]) = 0 OR account.id = ANY($2::uuid[]))
     GROUP BY account.id
     ORDER BY account.name`,
    [businessPartnerId, profile.accountIds]
  );
  return accountResult.rows.map((account) => ({
    ...account,
    aliases: getEntityAliases(account.name),
    websiteHost: getHost(account.website_url),
    competitors: profile.includeCompetitors
      ? (Array.isArray(account.competitors) ? account.competitors : []).map((competitor) => ({
          name: competitor.name,
          aliases: getEntityAliases(competitor.name),
        }))
      : [],
  }));
}

async function findContentTriggerMatches(queryable, businessPartnerId, rawProfile, options = {}) {
  const profile = normalizeProfilePayload(rawProfile, rawProfile);
  await assertAccountsBelongToTenant(queryable, businessPartnerId, profile.accountIds);
  const accounts = await loadTriggerAccounts(queryable, businessPartnerId, profile);
  const requestedLimit = Number(options.limit || 50);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 200);
  const candidateLimit = Math.min(Math.max(limit * 20, 250), 2000);
  const { rows: contents } = await queryable.query(
    `SELECT content.id::text, content.title, content.summary, content.full_text,
            content.original_url, content.source_identifier, content.published_date,
            content.created_at, content.category, content.region,
            COALESCE(content.relevance_score, 0)::int AS content_relevance
     FROM scraped_content content
     WHERE COALESCE(content.published_date, content.created_at::date)
             >= CURRENT_DATE - (($2::integer - 1) * INTERVAL '1 day')
       AND COALESCE(content.relevance_score, 0) >= $3
       AND NULLIF(TRIM(content.original_url), '') IS NOT NULL
       AND (
         content.category IS NULL
         OR content.category NOT IN ('businesspartner_news', 'businesspartner_events')
         OR content.source_identifier IN ($1::text || '_news', $1::text || '_events')
       )
       AND NOT EXISTS (
         SELECT 1 FROM scraping_rules private_rule
         WHERE private_rule.source_identifier = content.source_identifier
           AND private_rule.business_partner_id IS NOT NULL
           AND private_rule.business_partner_id <> $1::uuid
       )
     ORDER BY COALESCE(content.published_date, content.created_at::date) DESC, content.created_at DESC
     LIMIT $4`,
    [businessPartnerId, profile.lookbackDays, profile.minContentRelevance, candidateLimit]
  );

  const includeTerms = profile.includeKeywords.map((term) => ({ original: term, normalized: normalizeComparable(term) }));
  const excludeTerms = profile.excludeKeywords.map((term) => normalizeComparable(term));
  const matches = [];
  let keywordMatchesWithoutAccount = 0;
  const unassignedKeywordMatches = [];
  const unassignedKeys = new Set();
  for (const content of contents) {
    const normalizedTitle = normalizeComparable(content.title);
    const normalizedText = normalizeComparable(`${content.title || ''} ${content.summary || ''} ${String(content.full_text || '').slice(0, 30000)}`);
    const matchedKeywords = includeTerms.filter((term) => normalizedText.includes(term.normalized)).map((term) => term.original);
    if (!matchedKeywords.length || excludeTerms.some((term) => normalizedText.includes(term))) continue;
    const publishedAt = content.published_date || content.created_at;
    const ageDays = Math.max(0, Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86_400_000));
    const titleHit = includeTerms.some((term) => normalizedTitle.includes(term.normalized));
    const score = Math.min(99,
      58
      + Math.min(18, matchedKeywords.length * 6)
      + (titleHit ? 8 : 0)
      + (ageDays <= 7 ? 7 : ageDays <= 30 ? 4 : 0)
      + Math.min(8, Math.floor(Number(content.content_relevance || 0) / 15))
    );
    if (profile.scopeMode === 'unassigned') {
      matches.push({
        content_id: content.id,
        account_id: null,
        account_name: null,
        competitor_name: null,
        title: content.title,
        summary: content.summary,
        original_url: content.original_url,
        source_identifier: content.source_identifier,
        published_at: publishedAt,
        category: content.category,
        region: content.region,
        content_relevance: Number(content.content_relevance || 0),
        matched_keywords: matchedKeywords,
        match_score: score,
      });
      if (matches.length >= limit) break;
      continue;
    }
    const contentHost = getHost(content.original_url);
    const entities = [];
    for (const account of accounts) {
      if (textContainsAlias(normalizedText, account.aliases)
        || (account.websiteHost && contentHost === account.websiteHost)) {
        entities.push({ account, competitorName: null });
      }
      for (const competitor of account.competitors) {
        if (textContainsAlias(normalizedText, competitor.aliases)) {
          entities.push({ account, competitorName: competitor.name });
        }
      }
    }
    if (!entities.length) {
      keywordMatchesWithoutAccount += 1;
      const unassignedKey = content.original_url || content.id;
      if (unassignedKeywordMatches.length < 10 && !unassignedKeys.has(unassignedKey)) {
        unassignedKeys.add(unassignedKey);
        unassignedKeywordMatches.push({
          content_id: content.id,
          title: content.title,
          original_url: content.original_url,
          published_at: content.published_date || content.created_at,
          matched_keywords: matchedKeywords,
        });
      }
      continue;
    }
    for (const entity of entities) {
      matches.push({
        content_id: content.id,
        account_id: entity.account.id,
        account_name: entity.account.name,
        competitor_name: entity.competitorName,
        title: content.title,
        summary: content.summary,
        original_url: content.original_url,
        source_identifier: content.source_identifier,
        published_at: publishedAt,
        category: content.category,
        region: content.region,
        content_relevance: Number(content.content_relevance || 0),
        matched_keywords: matchedKeywords,
        match_score: score,
      });
      if (matches.length >= limit) break;
    }
    if (matches.length >= limit) break;
  }

  return {
    profile,
    matches,
    scanned: contents.length,
    accountCount: accounts.length,
    keywordMatchesWithoutAccount,
    unassignedKeywordMatches,
    limitReached: matches.length >= limit,
  };
}

async function importContentTriggerMatches(queryable, businessPartnerId, profileRecord, options = {}) {
  const preview = await findContentTriggerMatches(queryable, businessPartnerId, profileRecord, {
    limit: options.limit || 200,
  });
  let inserted = 0;
  let linked = 0;
  for (const match of preview.matches) {
    if (!match.account_id) {
      const marketResult = await queryable.query(
        `INSERT INTO account_radar_content_trigger_matches
          (business_partner_id, trigger_profile_id, scraped_content_id, account_id,
           tracked_article_id, competitor_name, matched_keywords, match_score, review_status)
         VALUES ($1, $2, $3, NULL, NULL, NULL, $4::text[], $5, 'new')
         ON CONFLICT (trigger_profile_id, scraped_content_id,
                      (COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid)),
                      (COALESCE(competitor_name, '')))
         DO UPDATE SET matched_keywords = EXCLUDED.matched_keywords,
                       match_score = EXCLUDED.match_score
         RETURNING (xmax = 0) AS inserted`,
        [businessPartnerId, profileRecord.id, match.content_id, match.matched_keywords, match.match_score]
      );
      if (marketResult.rows[0]?.inserted) inserted += 1;
      if (marketResult.rowCount > 0) linked += 1;
      continue;
    }
    const trackedResult = await queryable.query(
      `INSERT INTO business_partner_tracked_articles
        (account_id, competitor_name, article_title, article_url, source_name, published_at, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (account_id, article_url) DO UPDATE SET
         source_name = COALESCE(business_partner_tracked_articles.source_name, EXCLUDED.source_name),
         published_at = COALESCE(business_partner_tracked_articles.published_at, EXCLUDED.published_at),
         summary = COALESCE(NULLIF(business_partner_tracked_articles.summary, ''), EXCLUDED.summary)
       RETURNING id::text, (xmax = 0) AS inserted`,
      [match.account_id, match.competitor_name, match.title, match.original_url, match.source_identifier,
        match.published_at, match.summary]
    );
    const tracked = trackedResult.rows[0];
    if (tracked?.inserted) inserted += 1;
    const linkResult = await queryable.query(
      `INSERT INTO account_radar_content_trigger_matches
        (business_partner_id, trigger_profile_id, scraped_content_id, account_id,
         tracked_article_id, competitor_name, matched_keywords, match_score, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, 'assigned')
       ON CONFLICT (trigger_profile_id, scraped_content_id,
                    (COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid)),
                    (COALESCE(competitor_name, '')))
       DO UPDATE SET tracked_article_id = EXCLUDED.tracked_article_id,
                     matched_keywords = EXCLUDED.matched_keywords,
                     match_score = EXCLUDED.match_score
       RETURNING id`,
      [businessPartnerId, profileRecord.id, match.content_id, match.account_id, tracked.id,
        match.competitor_name, match.matched_keywords, match.match_score]
    );
    if (linkResult.rowCount > 0) linked += 1;
  }
  return { ...preview, inserted, linked };
}

async function processActiveContentTriggerProfiles(options = {}) {
  const values = [];
  let tenantFilter = '';
  if (options.businessPartnerId) {
    values.push(options.businessPartnerId);
    tenantFilter = `AND profile.business_partner_id = $${values.length}`;
  }
  const profileResult = await db.query(
    `SELECT profile.*
     FROM account_radar_trigger_profiles profile
     JOIN business_partners partner ON partner.id = profile.business_partner_id
     WHERE profile.is_active = TRUE
       AND partner.is_active = TRUE
       AND partner.sales_plan = 'premium'
       AND 'sales' = ANY(COALESCE(partner.enabled_modules, ARRAY['content']::text[]))
       AND (partner.subscription_end_date IS NULL OR partner.subscription_end_date >= CURRENT_DATE)
       AND (
         partner.sales_subscription_status = 'active'
         OR (partner.sales_subscription_status = 'trial' AND partner.sales_trial_ends_on >= CURRENT_DATE)
       )
       ${tenantFilter}
     ORDER BY profile.updated_at ASC`,
    values
  );
  const summary = { profiles: profileResult.rows.length, inserted: 0, linked: 0, failed: 0 };
  for (const profile of profileResult.rows) {
    try {
      const result = await importContentTriggerMatches(db, profile.business_partner_id, profile, {
        limit: options.limitPerProfile || 100,
      });
      summary.inserted += result.inserted;
      summary.linked += result.linked;
    } catch (error) {
      summary.failed += 1;
      console.error(`[AccountRadarTriggers] Profil ${profile.id} fehlgeschlagen:`, error.message);
    }
  }
  return summary;
}

module.exports = {
  TRIGGER_TEMPLATES,
  assignMarketSignalToAccount,
  assertAccountsBelongToTenant,
  ensureTemplateProfiles,
  findContentTriggerMatches,
  importContentTriggerMatches,
  listMarketSignals,
  listTriggerProfiles,
  normalizeProfilePayload,
  processActiveContentTriggerProfiles,
  updateMarketSignalStatus,
};
