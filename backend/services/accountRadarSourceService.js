const crypto = require('crypto');
const cheerio = require('cheerio');
const db = require('../config/db');
const { scrapeQueue } = require('./queueService');
const {
  assertPublicHostname,
  fetchPublicHtml,
  normalizeHttpUrl,
} = require('./publicAiAssistantService');
const { previewXmlFeedContent } = require('./scraperService');
const { isXmlFeedContent } = require('../utils/scrapingContent');

const SOURCE_LIMIT = 25;
const ALLOWED_REGIONS = new Set(['AT', 'DE', 'EU', 'DACH', 'GLOBAL']);

const cleanText = (value, maxLength) => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const stripWww = (hostname) => String(hostname || '').toLowerCase().replace(/^www\./, '');

function normalizeRegion(value) {
  const region = String(value || 'DACH').trim().toUpperCase();
  return ALLOWED_REGIONS.has(region) ? region : 'DACH';
}

function normalizeRequestedUrl(value) {
  const input = String(value || '').trim();
  if (!input) {
    const error = new Error('Bitte eine öffentliche Website- oder RSS-URL eingeben.');
    error.statusCode = 400;
    throw error;
  }
  let url;
  try {
    url = normalizeHttpUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch (cause) {
    const error = new Error(cause.message || 'Die Quellen-URL ist ungültig.');
    error.statusCode = 400;
    throw error;
  }
  if (url.toString().length > 2000) {
    const error = new Error('Die Quellen-URL ist zu lang.');
    error.statusCode = 400;
    throw error;
  }
  return url;
}

function feedCandidatesFromHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const candidates = [];
  $('link[rel~="alternate"][href]').each((_index, element) => {
    const type = String($(element).attr('type') || '').toLowerCase();
    if (!/(rss|atom|xml)/.test(type)) return;
    try {
      const candidate = normalizeHttpUrl(new URL($(element).attr('href'), pageUrl).toString());
      candidates.push(candidate);
    } catch (_) {}
  });
  return Array.from(new Map(candidates.map((url) => [url.toString(), url])).values()).slice(0, 1);
}

async function detectExternalSource(requestedUrl) {
  const sourceUrl = normalizeRequestedUrl(requestedUrl);
  await assertPublicHostname(sourceUrl.hostname);
  let fetched;
  try {
    fetched = await fetchPublicHtml(sourceUrl, sourceUrl, 3, 7000, { allowFeedPaths: true });
  } catch (cause) {
    const status = Number(cause.response?.status || 0);
    if ([401, 403, 429].includes(status)) {
      return {
        type: 'website',
        requestedUrl: sourceUrl.toString(),
        monitoredUrl: sourceUrl.toString(),
        feedDetected: false,
        preview: null,
        discoveredFromWebsite: false,
        warning: `Die Website blockiert die automatische Vorprüfung (HTTP ${status}). Sie wurde als Admin-Konfigurationsauftrag angelegt.`,
      };
    }
    const error = new Error(`Die Quelle konnte nicht kontrolliert geprüft werden: ${cause.message}`);
    error.statusCode = cause.statusCode || 502;
    throw error;
  }

  if (isXmlFeedContent(fetched.body, fetched.contentType)) {
    const preview = await previewXmlFeedContent(fetched.body, {
      url_pattern: fetched.finalUrl.toString(),
      category_default: 'industry_news',
    }, 8);
    return {
      type: 'rss',
      requestedUrl: sourceUrl.toString(),
      monitoredUrl: fetched.finalUrl.toString(),
      feedDetected: true,
      preview,
      discoveredFromWebsite: false,
    };
  }

  const candidates = feedCandidatesFromHtml(fetched.body, fetched.finalUrl);
  for (const candidate of candidates) {
    // Automatisch erkannte Feeds duerfen auf www/non-www wechseln, nicht aber
    // unbemerkt zu einem fremden Anbieter oder Tracking-Host springen.
    if (stripWww(candidate.hostname) !== stripWww(sourceUrl.hostname)) continue;
    try {
      await assertPublicHostname(candidate.hostname);
      const feed = await fetchPublicHtml(candidate, candidate, 3, 7000, { allowFeedPaths: true });
      if (!isXmlFeedContent(feed.body, feed.contentType)) continue;
      const preview = await previewXmlFeedContent(feed.body, {
        url_pattern: feed.finalUrl.toString(),
        category_default: 'industry_news',
      }, 8);
      return {
        type: 'rss',
        requestedUrl: sourceUrl.toString(),
        monitoredUrl: feed.finalUrl.toString(),
        feedDetected: true,
        preview,
        discoveredFromWebsite: true,
      };
    } catch (_) {
      // Weitere Feed-Kandidaten pruefen; die normale Website bleibt der Fallback.
    }
  }

  return {
    type: 'website',
    requestedUrl: sourceUrl.toString(),
    monitoredUrl: sourceUrl.toString(),
    feedDetected: false,
    preview: null,
    discoveredFromWebsite: false,
    warning: null,
  };
}

function buildSourceIdentifier(businessPartnerId, monitoredUrl) {
  const partner = String(businessPartnerId || '').replace(/-/g, '').slice(0, 8);
  const digest = crypto.createHash('sha256')
    .update(`${businessPartnerId}|${monitoredUrl}|${crypto.randomUUID()}`)
    .digest('hex')
    .slice(0, 16);
  return `salesmon_${partner}_${digest}`;
}

function buildDailySchedule(sourceIdentifier) {
  const digest = crypto.createHash('sha256').update(sourceIdentifier).digest();
  const minute = digest[0] % 60;
  const hour = 5 + (digest[1] % 3);
  return `${minute} ${hour} * * *`;
}

async function listExternalSources(queryable, businessPartnerId) {
  const { rows } = await queryable.query(
    `SELECT rule.id::text, rule.name, rule.url_pattern, rule.account_radar_requested_url,
            rule.account_radar_source_type, rule.region, rule.is_active, rule.schedule,
            rule.last_scraped_at, rule.created_at, rule.updated_at,
            CASE
              WHEN rule.account_radar_source_type = 'website' AND rule.is_active = FALSE
                   AND (rule.content_container_selector IS NULL OR rule.title_selector IS NULL OR rule.link_selector IS NULL)
                THEN 'pending_configuration'
              WHEN latest_job.status = 'failed' THEN 'error'
              WHEN rule.is_active = TRUE THEN 'active'
              ELSE 'paused'
            END AS status,
            COALESCE(content_stats.entry_count, 0)::int AS entry_count,
            latest_job.status AS last_job_status,
            latest_job.started_at AS last_job_started_at,
            latest_job.completed_at AS last_job_completed_at,
            latest_error.message AS last_error
     FROM scraping_rules rule
     LEFT JOIN LATERAL (
       SELECT job.id, job.status, job.started_at, job.completed_at
       FROM scraping_jobs job
       WHERE job.scraping_rule_id = rule.id
       ORDER BY job.started_at DESC NULLS LAST
       LIMIT 1
     ) latest_job ON TRUE
     LEFT JOIN LATERAL (
       SELECT log.message
       FROM scraping_logs log
       WHERE log.job_id = latest_job.id AND log.log_level = 'ERROR'
       ORDER BY log.created_at DESC
       LIMIT 1
     ) latest_error ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS entry_count
       FROM scraped_content content
       WHERE content.source_identifier = rule.source_identifier
     ) content_stats ON TRUE
     WHERE rule.business_partner_id = $1
       AND rule.account_radar_source_type IS NOT NULL
       AND rule.archived_at IS NULL
     ORDER BY rule.is_active DESC, lower(rule.name), rule.created_at DESC`,
    [businessPartnerId]
  );
  return rows;
}

async function enqueueExternalSource(queryable, source, jobLabel = 'Manuelle Prüfung') {
  const jobResult = await queryable.query(
    `INSERT INTO scraping_jobs (scraping_rule_id, status)
     VALUES ($1, 'pending')
     RETURNING id::text`,
    [source.id]
  );
  const jobId = jobResult.rows[0].id;
  await scrapeQueue.add(
    source.name || jobLabel,
    { ruleId: source.id, jobId },
    { jobId: `scrape:${source.id}:${Date.now()}` }
  );
  return jobId;
}

async function createExternalSource(businessPartnerId, userId, payload = {}) {
  const name = cleanText(payload.name, 120);
  if (name.length < 2) {
    const error = new Error('Der Quellenname muss mindestens zwei Zeichen enthalten.');
    error.statusCode = 400;
    throw error;
  }
  const detection = await detectExternalSource(payload.url);
  const client = await db.connect();
  let source;
  try {
    await client.query('BEGIN');
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM scraping_rules
       WHERE business_partner_id = $1
         AND account_radar_source_type IS NOT NULL
         AND archived_at IS NULL`,
      [businessPartnerId]
    );
    if (Number(countResult.rows[0]?.count || 0) >= SOURCE_LIMIT) {
      const error = new Error(`Sales Premium erlaubt maximal ${SOURCE_LIMIT} beobachtete Quellen pro Mandant.`);
      error.statusCode = 409;
      throw error;
    }
    const duplicate = await client.query(
      `SELECT id::text, name
       FROM scraping_rules
       WHERE business_partner_id = $1
         AND account_radar_source_type IS NOT NULL
         AND archived_at IS NULL
         AND (
           lower(trim(account_radar_requested_url)) = lower(trim($2))
           OR lower(trim(url_pattern)) = lower(trim($3))
         )
       LIMIT 1`,
      [businessPartnerId, detection.requestedUrl, detection.monitoredUrl]
    );
    if (duplicate.rows[0]) {
      const error = new Error(`Diese Quelle wird bereits als „${duplicate.rows[0].name}“ überwacht.`);
      error.statusCode = 409;
      throw error;
    }
    const sourceIdentifier = buildSourceIdentifier(businessPartnerId, detection.monitoredUrl);
    const active = detection.feedDetected;
    const insertResult = await client.query(
      `INSERT INTO scraping_rules
        (name, source_identifier, url_pattern, category_default, is_active, region,
         schedule, scrape_after_date, rule_type, use_headless_browser, scraping_strategy,
         business_partner_id, account_radar_source_type, account_radar_requested_url,
         created_by, updated_by)
       VALUES ($1, $2, $3, 'industry_news', $4, $5, $6,
               CURRENT_DATE - INTERVAL '365 days', 'content', FALSE, 'standard',
               $7, $8, $9, $10, $10)
       RETURNING *`,
      [
        name,
        sourceIdentifier,
        detection.monitoredUrl,
        active,
        normalizeRegion(payload.region),
        active ? buildDailySchedule(sourceIdentifier) : null,
        businessPartnerId,
        detection.type,
        detection.requestedUrl,
        userId || null,
      ]
    );
    source = insertResult.rows[0];
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }

  let jobId = null;
  let queueWarning = null;
  if (source.is_active) {
    try {
      jobId = await enqueueExternalSource(db, source, 'Neue externe Quelle');
    } catch (error) {
      queueWarning = 'Die Quelle wurde angelegt, konnte aber noch nicht sofort gestartet werden.';
    }
  }
  return { source, detection, jobId, queueWarning };
}

async function getExternalSource(queryable, businessPartnerId, sourceId, { forUpdate = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT * FROM scraping_rules
     WHERE id = $1 AND business_partner_id = $2
       AND account_radar_source_type IS NOT NULL AND archived_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
    [sourceId, businessPartnerId]
  );
  if (!rows[0]) {
    const error = new Error('Externe Quelle wurde nicht gefunden.');
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
}

async function runExternalSource(queryable, businessPartnerId, sourceId) {
  const source = await getExternalSource(queryable, businessPartnerId, sourceId);
  if (!source.is_active) {
    const error = new Error(source.account_radar_source_type === 'website'
      ? 'Die Website muss zuerst durch den Admin konfiguriert und freigegeben werden.'
      : 'Die Quelle ist pausiert. Bitte zuerst wieder aktivieren.');
    error.statusCode = 409;
    throw error;
  }
  const activeJob = await queryable.query(
    `SELECT id::text FROM scraping_jobs
     WHERE scraping_rule_id = $1 AND status IN ('pending', 'running')
     ORDER BY started_at DESC LIMIT 1`,
    [source.id]
  );
  if (activeJob.rows[0]) {
    const error = new Error('Für diese Quelle läuft bereits eine Prüfung.');
    error.statusCode = 409;
    throw error;
  }
  return { source, jobId: await enqueueExternalSource(queryable, source) };
}

async function setExternalSourceEnabled(queryable, businessPartnerId, sourceId, enabled) {
  const source = await getExternalSource(queryable, businessPartnerId, sourceId, { forUpdate: true });
  if (enabled && source.account_radar_source_type === 'website'
    && (!source.content_container_selector || !source.title_selector || !source.link_selector)) {
    const error = new Error('Diese Website benötigt zuerst eine Admin-Konfiguration der HTML-Selektoren.');
    error.statusCode = 409;
    throw error;
  }
  const schedule = enabled && !source.schedule ? buildDailySchedule(source.source_identifier) : source.schedule;
  const { rows } = await queryable.query(
    `UPDATE scraping_rules
     SET is_active = $3, schedule = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND business_partner_id = $2
     RETURNING *`,
    [source.id, businessPartnerId, enabled, schedule]
  );
  return rows[0];
}

async function archiveExternalSource(queryable, businessPartnerId, sourceId, userId = null) {
  await getExternalSource(queryable, businessPartnerId, sourceId, { forUpdate: true });
  const { rows } = await queryable.query(
    `UPDATE scraping_rules
     SET is_active = FALSE, schedule = NULL, archived_at = CURRENT_TIMESTAMP,
         archived_by = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND business_partner_id = $2
     RETURNING id::text`,
    [sourceId, businessPartnerId, userId]
  );
  return rows[0];
}

module.exports = {
  SOURCE_LIMIT,
  archiveExternalSource,
  createExternalSource,
  detectExternalSource,
  getExternalSource,
  listExternalSources,
  runExternalSource,
  setExternalSourceEnabled,
};
