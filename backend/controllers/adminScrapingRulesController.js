// backend/controllers/adminScrapingRulesController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { getScrapingRuleSuggestion, previewScrapingRule } = require('../services/scraperService');
const { scrapeQueue, heartbeatRedisClient } = require('../services/queueService');
const jobManager = require('../services/jobManagerService');
const { parse } = require('date-fns');

let logActivity = null;
try {
    ({ logActivity } = require('../services/auditLogService'));
} catch (_) {
    logActivity = null;
}

const isValidUUID = (uuid) =>
    uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const ALLOWED_RULE_TYPES = new Set(['content', 'funding']);
const ALLOWED_STRATEGIES = new Set(['standard', 'html_embedded_json', 'youtube_channel', 'youtube_podcast', 'youtube_music']);
const BP_CATEGORIES = new Set(['businesspartner_news', 'businesspartner_events']);
const MANAGED_CATEGORY_SUFFIX = {
    businesspartner_news: 'news',
    businesspartner_events: 'events',
};

let schemaCapabilitiesCache = null;

async function getSchemaCapabilities() {
    if (schemaCapabilitiesCache) return schemaCapabilitiesCache;

    const { rows } = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'scraping_rules'
          AND column_name IN ('business_partner_id', 'archived_at', 'archived_by', 'created_by', 'updated_by')
    `);

    const cols = new Set(rows.map(r => r.column_name));
    schemaCapabilitiesCache = {
        hasBusinessPartnerId: cols.has('business_partner_id'),
        hasArchivedAt: cols.has('archived_at'),
        hasArchivedBy: cols.has('archived_by'),
        hasCreatedBy: cols.has('created_by'),
        hasUpdatedBy: cols.has('updated_by'),
    };
    return schemaCapabilitiesCache;
}

function trimOrNull(value) {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
}

function normalizeRulePayload(body = {}) {
    const categoryDefault = trimOrNull(body.category_default);
    const ruleType = trimOrNull(body.rule_type) || 'content';
    const strategy = trimOrNull(body.scraping_strategy) || 'standard';

    return {
        name: trimOrNull(body.name),
        source_identifier: trimOrNull(body.source_identifier),
        url_pattern: trimOrNull(body.url_pattern),
        content_container_selector: trimOrNull(body.content_container_selector),
        title_selector: trimOrNull(body.title_selector),
        date_selector: trimOrNull(body.date_selector),
        description_selector: trimOrNull(body.description_selector),
        link_selector: trimOrNull(body.link_selector),
        thumbnail_selector: trimOrNull(body.thumbnail_selector),
        date_format: trimOrNull(body.date_format),
        category_default: categoryDefault,
        is_active: body.is_active === undefined ? true : !!body.is_active,
        region: trimOrNull(body.region),
        schedule: trimOrNull(body.schedule),
        scrape_after_date: trimOrNull(body.scrape_after_date),
        rule_type: ruleType,
        use_headless_browser: !!body.use_headless_browser,
        scraping_strategy: strategy,
        business_partner_id: isValidUUID(body.business_partner_id) ? body.business_partner_id : null,
    };
}

function isPrivateOrLocalHost(hostname) {
    if (!hostname) return true;
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host === 'metadata.google.internal') return true;

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const parts = ipv4.slice(1).map(Number);
        if (parts.some(p => p < 0 || p > 255)) return true;
        const [a, b] = parts;
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
    }

    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true;
    return false;
}

function validateHttpUrl(rawUrl, errors) {
    if (!rawUrl) {
        errors.push('URL ist erforderlich.');
        return null;
    }

    try {
        const parsed = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            errors.push('Nur http- und https-URLs sind erlaubt.');
        }
        if (isPrivateOrLocalHost(parsed.hostname)) {
            errors.push('Lokale/private Hosts sind aus Sicherheitsgründen nicht erlaubt.');
        }
        return parsed;
    } catch (_) {
        errors.push('URL ist ungültig.');
        return null;
    }
}

function looksLikeYoutubeUrl(url) {
    return /(^|\.)youtube\.com$/i.test(url.hostname) || /(^|\.)youtu\.be$/i.test(url.hostname) || /(^|\.)music\.youtube\.com$/i.test(url.hostname);
}

function validateCronExpression(schedule, errors, warnings) {
    if (!schedule) return;
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) {
        errors.push('Cron-Zeitplan muss aus 5 Feldern bestehen: Minute Stunde Tag Monat Wochentag.');
        return;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const checkField = (field, min, max, name, allowStar = true) => {
        if (allowStar && field === '*') return;
        if (!/^\d+$/.test(field)) {
            errors.push(`${name} im Cron-Zeitplan muss eine Zahl oder * sein.`);
            return;
        }
        const num = Number(field);
        if (num < min || num > max) errors.push(`${name} im Cron-Zeitplan liegt außerhalb des gültigen Bereichs (${min}-${max}).`);
        if (/^0\d+/.test(field)) warnings.push(`${name} enthält führende Nullen. Der Scheduler erwartet Zahlen ohne führende Nullen.`);
    };

    checkField(minute, 0, 59, 'Minute', false);
    checkField(hour, 0, 23, 'Stunde', false);
    checkField(dayOfMonth, 1, 31, 'Tag im Monat');
    checkField(month, 1, 12, 'Monat');
    checkField(dayOfWeek, 0, 7, 'Wochentag');

    if (dayOfMonth !== '*' && dayOfWeek !== '*') {
        warnings.push('Cron nutzt gleichzeitig Tag im Monat und Wochentag. Das kann je nach Parser unerwartet wirken.');
    }
}

function validateSourceIdentifier(value, errors) {
    if (!value) {
        errors.push('Source Identifier ist erforderlich.');
        return;
    }
    if (value.length > 100) errors.push('Source Identifier darf maximal 100 Zeichen lang sein.');
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) {
        errors.push('Source Identifier darf nur Kleinbuchstaben, Zahlen, Unterstrich und Bindestrich enthalten und muss mit Buchstabe/Zahl beginnen.');
    }
}

async function ensureCategoryExists(categoryName, errors) {
    if (!categoryName) {
        errors.push('Standard-Kategorie ist erforderlich.');
        return null;
    }

    if (categoryName === 'funding' || categoryName === 'traffic') {
        return { name: categoryName, category_type: categoryName };
    }

    const { rows } = await db.query(
        'SELECT id, name, category_type FROM categories WHERE name = $1 LIMIT 1',
        [categoryName]
    );

    if (rows.length === 0) {
        errors.push(`Kategorie "${categoryName}" existiert nicht.`);
        return null;
    }

    return rows[0];
}

async function ensureBusinessPartnerExists(bpId, errors) {
    if (!bpId) return null;
    const { rows } = await db.query('SELECT id, name FROM business_partners WHERE id = $1 LIMIT 1', [bpId]);
    if (rows.length === 0) {
        errors.push('Der gewählte Business Partner existiert nicht.');
        return null;
    }
    return rows[0];
}

function inferBusinessPartnerIdFromSourceIdentifier(sourceIdentifier, categoryDefault) {
    if (!sourceIdentifier || !BP_CATEGORIES.has(categoryDefault)) return null;
    const suffix = MANAGED_CATEGORY_SUFFIX[categoryDefault];
    const expectedSuffix = `_${suffix}`;
    if (!sourceIdentifier.endsWith(expectedSuffix)) return null;
    const possibleId = sourceIdentifier.slice(0, -expectedSuffix.length);
    return isValidUUID(possibleId) ? possibleId : null;
}

function buildManagedSourceIdentifier(bpId, categoryDefault) {
    const suffix = MANAGED_CATEGORY_SUFFIX[categoryDefault];
    if (!bpId || !suffix) return null;
    return `${bpId}_${suffix}`;
}

async function validateAndPrepareRule(rawBody, options = {}) {
    const { mode = 'create', existingRule = null } = options;
    const errors = [];
    const warnings = [];
    const input = normalizeRulePayload(rawBody);

    const parsedUrl = validateHttpUrl(input.url_pattern, errors);

    if (!ALLOWED_RULE_TYPES.has(input.rule_type)) {
        errors.push(`Ungültiger Regel-Typ: ${input.rule_type}`);
    }

    if (!ALLOWED_STRATEGIES.has(input.scraping_strategy)) {
        errors.push(`Ungültige Scraping-Strategie: ${input.scraping_strategy}`);
    }

    const category = await ensureCategoryExists(input.category_default, errors);

    if (input.scraping_strategy.startsWith('youtube_')) {
        if (input.rule_type !== 'content') errors.push('YouTube-Strategien sind nur für Content-Regeln erlaubt.');
        if (input.use_headless_browser) warnings.push('Headless-Browser wird bei YouTube-Strategien ignoriert.');
        if (parsedUrl && !looksLikeYoutubeUrl(parsedUrl)) errors.push('YouTube-Strategie erfordert eine YouTube-URL.');
        if (input.scraping_strategy === 'youtube_music' && !/list=/.test(input.url_pattern || '')) {
            errors.push('YouTube Music benötigt eine Playlist-URL mit list=...');
        }
        if (input.scraping_strategy === 'youtube_channel' && !/(youtube\.com\/(channel\/|@)|youtu\.be\/)/i.test(input.url_pattern || '')) {
            errors.push('YouTube Kanal-Feed erwartet eine /channel/... URL oder einen @handle.');
        }
    }

    if (input.rule_type === 'funding') {
        if (!['standard', 'html_embedded_json'].includes(input.scraping_strategy)) {
            errors.push('Funding-Regeln unterstützen aktuell nur Standard oder html_embedded_json.');
        }
    }

    if (input.scraping_strategy === 'standard' && input.rule_type === 'content' && parsedUrl) {
        if (input.url_pattern && !/rss|feed|xml|atom/i.test(input.url_pattern)) {
            if (!input.content_container_selector && !input.use_headless_browser) {
                warnings.push('Für HTML-Standard-Regeln sollte ein Container-Selektor gesetzt sein. Bei RSS/XML ist kein Selektor nötig.');
            }
            if (!input.link_selector && input.content_container_selector) warnings.push('Link-Selektor fehlt. Ohne Link werden HTML-Einträge meist übersprungen.');
            if (!input.title_selector && input.content_container_selector) warnings.push('Titel-Selektor fehlt. Ohne Titel werden HTML-Einträge übersprungen.');
        }
    }

    validateCronExpression(input.schedule, errors, warnings);

    const isBusinessPartnerCategory = BP_CATEGORIES.has(input.category_default);
    let finalBusinessPartnerId = input.business_partner_id;

    if (isBusinessPartnerCategory && !finalBusinessPartnerId) {
        finalBusinessPartnerId = inferBusinessPartnerIdFromSourceIdentifier(input.source_identifier, input.category_default);
    }

    if (isBusinessPartnerCategory) {
        if (!finalBusinessPartnerId) {
            errors.push('Businesspartner-News/Events benötigen einen Business Partner.');
        } else {
            await ensureBusinessPartnerExists(finalBusinessPartnerId, errors);
            input.source_identifier = buildManagedSourceIdentifier(finalBusinessPartnerId, input.category_default);
        }
    } else if (mode === 'update' && existingRule) {
        input.source_identifier = existingRule.source_identifier;
    }

    validateSourceIdentifier(input.source_identifier, errors);

    if (mode === 'update' && existingRule && !isBusinessPartnerCategory) {
        const requestedSource = trimOrNull(rawBody.source_identifier);
        if (requestedSource && requestedSource !== existingRule.source_identifier) {
            errors.push('Source Identifier ist nach Erstellung gesperrt und darf nicht geändert werden.');
        }
    }

    if (category && category.category_type !== 'content' && input.rule_type === 'content' && !isBusinessPartnerCategory) {
        warnings.push(`Kategorie "${category.name}" hat Typ "${category.category_type}". Für Content-Regeln wird normalerweise category_type="content" erwartet.`);
    }

    input.business_partner_id = finalBusinessPartnerId;
    input.use_headless_browser = input.scraping_strategy.startsWith('youtube_') ? false : input.use_headless_browser;

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        data: input,
    };
}

async function audit(req, actionType, status, details = {}) {
    if (!logActivity) return;
    try {
        await logActivity({
            userId: req.user?.id,
            username: req.user?.username || req.user?.email || 'Admin',
            actionType,
            status,
            details,
        });
    } catch (_) {}
}

function normalizeScrapingRuleRow(row) {
    const inferredBpId = row.business_partner_id || inferBusinessPartnerIdFromSourceIdentifier(row.source_identifier, row.category_default);
    const validationWarnings = [];

    if (BP_CATEGORIES.has(row.category_default) && !inferredBpId) {
        validationWarnings.push('Businesspartner-Kategorie ohne gültige Mandantenzuordnung im Source Identifier.');
    }

    if (row.scraping_strategy === 'youtube_channel' && row.url_pattern && !/(youtube\.com\/(channel\/|@)|youtu\.be\/)/i.test(row.url_pattern)) {
        validationWarnings.push('YouTube-Kanal-Regel sollte /channel/... oder @handle verwenden.');
    }

    return {
        ...row,
        inferred_business_partner_id: inferredBpId,
        validation_warnings: validationWarnings,
        active_job_id: row.active_job_id || null,
        active_job_status: row.active_job_status || null,
    };
}

exports.getAllScrapingRules = async (req, res) => {
    try {
        const caps = await getSchemaCapabilities();
        const bpSelect = caps.hasBusinessPartnerId ? 'r.business_partner_id,' : 'NULL::uuid AS business_partner_id,';
        const archivedWhere = caps.hasArchivedAt ? 'WHERE r.archived_at IS NULL' : '';
        const archivedSelect = caps.hasArchivedAt ? 'r.archived_at,' : 'NULL::timestamptz AS archived_at,';

        const query = `
            SELECT
                r.*,
                ${bpSelect}
                ${archivedSelect}
                bp.name AS business_partner_name,
                (CASE
                    WHEN r.rule_type = 'funding' THEN (SELECT COUNT(*) FROM funding_opportunities fo WHERE fo.source_rule_id = r.id)
                    WHEN r.source_identifier LIKE '%traffic%' THEN (SELECT COUNT(*) FROM traffic_incidents ti WHERE ti.source_identifier = r.source_identifier)
                    ELSE (SELECT COUNT(*) FROM scraped_content sc WHERE sc.source_identifier = r.source_identifier)
                END)::INTEGER AS current_entry_count,
                latest_job.status AS last_job_status,
                latest_job.started_at AS last_job_started_at,
                latest_job.completed_at AS last_job_completed_at,
                active_job.id AS active_job_id,
                active_job.status AS active_job_status
            FROM scraping_rules r
            LEFT JOIN business_partners bp
                ON bp.id = ${caps.hasBusinessPartnerId ? 'r.business_partner_id' : `NULL`}
            LEFT JOIN LATERAL (
                SELECT sj.status, sj.started_at, sj.completed_at
                FROM scraping_jobs sj
                WHERE sj.scraping_rule_id = r.id
                ORDER BY sj.started_at DESC
                LIMIT 1
            ) latest_job ON true
            LEFT JOIN LATERAL (
                SELECT sj.id, sj.status
                FROM scraping_jobs sj
                WHERE sj.scraping_rule_id = r.id
                  AND sj.status IN ('pending', 'running')
                ORDER BY sj.started_at DESC
                LIMIT 1
            ) active_job ON true
            ${archivedWhere}
            ORDER BY r.name ASC;
        `;

        const result = await db.query(query);
        res.json(result.rows.map(normalizeScrapingRuleRow));
    } catch (err) {
        console.error('Error fetching all scraping rules:', err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.createScrapingRule = async (req, res) => {
    try {
        const validation = await validateAndPrepareRule(req.body, { mode: 'create' });
        if (!validation.ok) {
            return res.status(400).json({ message: validation.errors.join(' '), errors: validation.errors, warnings: validation.warnings });
        }

        const caps = await getSchemaCapabilities();
        const rule = validation.data;
        const id = uuidv4();

        const columns = [
            'id', 'name', 'source_identifier', 'url_pattern', 'content_container_selector', 'title_selector',
            'date_selector', 'description_selector', 'link_selector', 'thumbnail_selector', 'date_format',
            'category_default', 'is_active', 'region', 'schedule', 'scrape_after_date', 'rule_type',
            'use_headless_browser', 'scraping_strategy'
        ];
        const values = [
            id, rule.name, rule.source_identifier, rule.url_pattern, rule.content_container_selector, rule.title_selector,
            rule.date_selector, rule.description_selector, rule.link_selector, rule.thumbnail_selector, rule.date_format,
            rule.category_default, rule.is_active, rule.region, rule.schedule, rule.scrape_after_date, rule.rule_type,
            rule.use_headless_browser, rule.scraping_strategy
        ];

        if (caps.hasBusinessPartnerId) {
            columns.push('business_partner_id');
            values.push(rule.business_partner_id);
        }
        if (caps.hasCreatedBy) {
            columns.push('created_by');
            values.push(req.user?.id || null);
        }
        if (caps.hasUpdatedBy) {
            columns.push('updated_by');
            values.push(req.user?.id || null);
        }

        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const query = `INSERT INTO scraping_rules (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        const newRuleRes = await db.query(query, values);
        const newRule = newRuleRes.rows[0];

        if (newRule.schedule) {
            await jobManager.setScrapingSchedule(newRule.id, newRule.schedule);
        }

        await audit(req, 'ADMIN_CREATE_SCRAPING_RULE', 'success', { ruleId: newRule.id, sourceIdentifier: newRule.source_identifier, warnings: validation.warnings });

        res.status(201).json({ ...newRule, warnings: validation.warnings });
    } catch (err) {
        console.error('Error creating scraping rule:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'Source Identifier existiert bereits.' });
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.updateScrapingRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const existingRes = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [id]);
        if (existingRes.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });
        const existingRule = existingRes.rows[0];

        const validation = await validateAndPrepareRule(req.body, { mode: 'update', existingRule });
        if (!validation.ok) {
            return res.status(400).json({ message: validation.errors.join(' '), errors: validation.errors, warnings: validation.warnings });
        }

        const caps = await getSchemaCapabilities();
        const rule = validation.data;

        const assignments = [
            'name = $1',
            'source_identifier = $2',
            'url_pattern = $3',
            'content_container_selector = $4',
            'title_selector = $5',
            'date_selector = $6',
            'description_selector = $7',
            'link_selector = $8',
            'thumbnail_selector = $9',
            'date_format = $10',
            'category_default = $11',
            'is_active = $12',
            'region = $13',
            'schedule = $14',
            'scrape_after_date = $15',
            'rule_type = $16',
            'use_headless_browser = $17',
            'scraping_strategy = $18',
            'updated_at = CURRENT_TIMESTAMP'
        ];
        const values = [
            rule.name, rule.source_identifier, rule.url_pattern, rule.content_container_selector, rule.title_selector,
            rule.date_selector, rule.description_selector, rule.link_selector, rule.thumbnail_selector, rule.date_format,
            rule.category_default, rule.is_active, rule.region, rule.schedule, rule.scrape_after_date, rule.rule_type,
            rule.use_headless_browser, rule.scraping_strategy
        ];

        if (caps.hasBusinessPartnerId) {
            values.push(rule.business_partner_id);
            assignments.push(`business_partner_id = $${values.length}`);
        }
        if (caps.hasUpdatedBy) {
            values.push(req.user?.id || null);
            assignments.push(`updated_by = $${values.length}`);
        }

        values.push(id);
        const query = `UPDATE scraping_rules SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`;
        const result = await db.query(query, values);

        const updatedRule = result.rows[0];
        await jobManager.setScrapingSchedule(updatedRule.id, updatedRule.schedule);

        await audit(req, 'ADMIN_UPDATE_SCRAPING_RULE', 'success', { ruleId: updatedRule.id, sourceIdentifier: updatedRule.source_identifier, warnings: validation.warnings });

        res.json({ ...updatedRule, warnings: validation.warnings });
    } catch (err) {
        console.error('Error updating scraping rule:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'Source Identifier existiert bereits.' });
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.deleteScrapingRule = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const caps = await getSchemaCapabilities();
        await jobManager.removeScrapingSchedule(id);

        let result;
        if (caps.hasArchivedAt) {
            const params = [id];
            let setClause = `is_active = false, archived_at = NOW(), updated_at = NOW()`;
            if (caps.hasArchivedBy) {
                params.push(req.user?.id || null);
                setClause += `, archived_by = $2`;
            }
            result = await db.query(`UPDATE scraping_rules SET ${setClause} WHERE id = $1 RETURNING id`, params);
        } else {
            result = await db.query('UPDATE scraping_rules SET is_active = false, schedule = NULL, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
        }

        if (result.rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });

        await audit(req, 'ADMIN_ARCHIVE_SCRAPING_RULE', 'success', { ruleId: id });
        res.json({ message: caps.hasArchivedAt ? 'Scraping rule archived successfully.' : 'Scraping rule disabled successfully.' });
    } catch (err) {
        console.error('Error archiving scraping rule:', err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.updateScrapingRuleSchedule = async (req, res) => {
    const { id } = req.params;
    const { schedule } = req.body;

    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const errors = [];
    const warnings = [];
    validateCronExpression(trimOrNull(schedule), errors, warnings);
    if (errors.length > 0) return res.status(400).json({ message: errors.join(' '), errors, warnings });

    try {
        const { rows } = await db.query(
            'UPDATE scraping_rules SET schedule = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [trimOrNull(schedule), id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Regel nicht gefunden.' });

        await jobManager.setScrapingSchedule(id, trimOrNull(schedule));
        await audit(req, 'ADMIN_UPDATE_SCRAPING_RULE_SCHEDULE', 'success', { ruleId: id, schedule: trimOrNull(schedule), warnings });

        res.status(200).json({ message: 'Zeitplan erfolgreich aktualisiert.', warnings });
    } catch (err) {
        console.error(`Error updating schedule for scraping rule ${id}:`, err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.triggerScrapeJob = async (req, res) => {
    const { id: ruleId } = req.params;
    if (!isValidUUID(ruleId)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const ruleRes = await db.query('SELECT id, name, source_identifier, is_active FROM scraping_rules WHERE id = $1', [ruleId]);
        if (ruleRes.rows.length === 0) return res.status(404).json({ message: 'Scraping-Regel nicht gefunden.' });

        const activeJobRes = await db.query(
            `SELECT id, status, started_at
             FROM scraping_jobs
             WHERE scraping_rule_id = $1 AND status IN ('pending', 'running')
             ORDER BY started_at DESC
             LIMIT 1`,
            [ruleId]
        );

        if (activeJobRes.rows.length > 0 && !req.query.force) {
            return res.status(409).json({
                message: 'Für diese Regel läuft bereits ein Job oder wartet in der Queue.',
                activeJob: activeJobRes.rows[0]
            });
        }

        const rule = ruleRes.rows[0];
        const jobName = rule.name || rule.source_identifier;

        const jobResult = await db.query(
            `INSERT INTO scraping_jobs (scraping_rule_id, status) VALUES ($1, 'pending') RETURNING id`,
            [ruleId]
        );
        const jobId = jobResult.rows[0].id;

        await scrapeQueue.add(
            jobName,
            { ruleId, jobId },
            { jobId: `scrape:${ruleId}:${Date.now()}` }
        );

        await audit(req, 'ADMIN_TRIGGER_SCRAPING_RULE', 'success', { ruleId, jobId, sourceIdentifier: rule.source_identifier });

        return res.status(202).json({ message: 'Scrape enqueued', jobId });
    } catch (err) {
        console.error('Error initiating scrape job:', err.message);
        res.status(500).json({ message: 'Job konnte nicht initialisiert werden.', error: err.message });
    }
};

exports.getScrapeLogs = async (req, res) => {
    const { jobId } = req.params;
    if (!isValidUUID(jobId)) return res.status(400).json({ message: 'Invalid Job ID format.' });
    try {
        const jobStatusRes = await db.query('SELECT status FROM scraping_jobs WHERE id = $1', [jobId]);
        if (jobStatusRes.rows.length === 0) return res.status(404).json({ message: 'Job nicht gefunden.' });

        const logsRes = await db.query(
            'SELECT log_level, message, created_at FROM scraping_logs WHERE job_id = $1 ORDER BY created_at ASC',
            [jobId]
        );

        res.json({ status: jobStatusRes.rows[0].status, logs: logsRes.rows });
    } catch (err) {
        console.error('Error fetching scrape logs:', err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.getSuggestionForUrl = async (req, res) => {
    const { url } = req.body;
    const { id: userId } = req.user;
    try {
        const errors = [];
        validateHttpUrl(url, errors);
        if (errors.length > 0) return res.status(400).json({ message: errors.join(' '), errors });

        const suggestion = await getScrapingRuleSuggestion(url, userId);
        res.json(suggestion);
    } catch (err) {
        console.error('Error getting scraping rule suggestion:', err.message);
        res.status(500).json({ message: err.message });
    }
};

exports.testScrapingRule = async (req, res) => {
    try {
        let body = req.body || {};
        let existingRule = null;
        const ruleId = body.id || req.params.id;

        if (ruleId && isValidUUID(ruleId)) {
            const existingRes = await db.query('SELECT * FROM scraping_rules WHERE id = $1', [ruleId]);
            if (existingRes.rows.length > 0) existingRule = existingRes.rows[0];
            body = { ...existingRule, ...body };
        }

        const validation = await validateAndPrepareRule(body, { mode: existingRule ? 'update' : 'create', existingRule });
        if (!validation.ok) {
            return res.status(400).json({
                ok: false,
                message: validation.errors.join(' '),
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }

        const preview = await previewScrapingRule(validation.data, { limit: 10 });
        await audit(req, 'ADMIN_TEST_SCRAPING_RULE', 'success', { sourceIdentifier: validation.data.source_identifier, strategy: validation.data.scraping_strategy });

        res.json({
            ok: true,
            validation: { warnings: validation.warnings },
            preview,
        });
    } catch (err) {
        console.error('Error testing scraping rule:', err.message);
        res.status(500).json({ ok: false, message: err.message });
    }
};

exports.getQueueStatus = async (_req, res) => {
    try {
        const counts = await scrapeQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
        let scrapeHeartbeat = null;
        let scrapeHeartbeatTtl = null;
        try {
            scrapeHeartbeat = await heartbeatRedisClient.get('worker_heartbeat:scrapeWorker');
            scrapeHeartbeatTtl = await heartbeatRedisClient.ttl('worker_heartbeat:scrapeWorker');
        } catch (_) {}

        res.json({
            queue: 'scrape-content-generation',
            counts,
            worker: {
                name: 'scrapeWorker',
                online: !!scrapeHeartbeat && scrapeHeartbeatTtl > 0,
                heartbeat: scrapeHeartbeat,
                ttl: scrapeHeartbeatTtl,
            }
        });
    } catch (err) {
        console.error('Error fetching scrape queue status:', err.message);
        res.status(500).json({ message: 'Queue-Status konnte nicht geladen werden.', error: err.message });
    }
};

exports.testDateFormat = async (req, res) => {
    const { dateString, formatString } = req.body;
    if (!dateString || !formatString) {
        return res.status(400).json({ message: 'dateString und formatString sind erforderlich.' });
    }
    try {
        const referenceDate = new Date();
        const parsedDate = parse(dateString, formatString, referenceDate);
        if (!isNaN(parsedDate.getTime())) {
            res.json({ success: true, message: 'Format ist korrekt.', parsedResult: parsedDate.toISOString() });
        } else {
            throw new Error('Das resultierende Datum ist ungültig.');
        }
    } catch (err) {
        res.status(400).json({ success: false, message: 'Format-Fehler: Das angegebene Format passt nicht auf den Datums-String.' });
    }
};

exports.inferDateFormat = async (req, res) => {
    const { dateString } = req.body;
    if (!dateString) return res.status(400).json({ message: 'Ein Beispiel-Datumsstring (dateString) ist erforderlich.' });

    const formatsToTry = [
        'd.M.yy HH:mm:ss', 'dd.MM.yyyy HH:mm:ss', 'yyyy-MM-dd HH:mm:ss',
        'd.M.yy HH:mm', 'dd.MM.yyyy HH:mm', 'd. MMMM yyyy, HH:mm', 'yyyy-MM-dd HH:mm',
        'dd.MM.yy', 'd.MM.yy', 'dd.M.yy', 'dd.MM.yyyy', 'd.MM.yyyy', 'dd.M.yyyy',
        'd. MMMM yyyy', 'd. MMM yyyy', 'yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy',
        "EEE, dd MMM yyyy HH:mm:ss 'GMT'", 'EEE, dd MMM yyyy HH:mm:ss xx',
        "yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-M-d'T'H:m:sX", "yyyy-MM-dd'T'HH:mm:ssX",
        'dd-MM-yy', 'd-M-yy', 'dd-MM-yyyy',
    ];
    for (const format of formatsToTry) {
        try {
            const parsedDate = parse(dateString, format, new Date());
            if (!isNaN(parsedDate.getTime())) return res.json({ success: true, format, message: `Format gefunden: ${format}` });
        } catch (e) {}
    }
    res.status(400).json({ success: false, message: 'Konnte kein passendes Datumsformat für den angegebenen Text finden.' });
};
