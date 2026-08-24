// backend/controllers/adminStatsController.js
const db = require('../config/db');

/**
 * Canonical definitions (harmonisiert):
 * - "Login" = activity_log.action_type IN ('LOGIN_SUCCESS', 'USER_LOGIN', 'LOGIN') AND status='success'
 * - "Scraped Inhalte" = COUNT(scraped_content) im Zeitraum (scraped_at)
 * - "Scraping Jobs" = COUNT(scraping_jobs) im Zeitraum (completed_at) mit status='completed'
 * - "AI Tokens (Redactional)" = SUM(activity_log.details.tokenUsage.totalTokens) für action_type LIKE 'AI_%_SUCCESS'
 * - "AI Tokens (Jobs/Usage Logs)" = SUM(ai_usage_logs.total_tokens)
 * - "Total Tokens" = Redactional + UsageLogs (nicht doppelt gezählt – setzt voraus, dass ihr beides getrennt loggt)
 */

const LOGIN_ACTION_TYPES = ['LOGIN_SUCCESS', 'USER_LOGIN', 'LOGIN'];

function parseMonthParam(month) {
    // month: 'YYYY-MM'
    if (!month || typeof month !== 'string') return null;
    if (!/^\d{4}-\d{2}$/.test(month)) return null;
    const [y, m] = month.split('-').map((v) => parseInt(v, 10));
    if (!y || !m || m < 1 || m > 12) return null;

    // Start: 1. des Monats 00:00:00 (lokale Zeit)
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    // End: 1. des Folgemonats 00:00:00
    const end = new Date(y, m, 1, 0, 0, 0, 0);
    return { start, end };
}

function getTimeframe(timespan, month) {
    // Wenn "month=YYYY-MM" gesetzt ist: echter Kalendermonat statt "rolling 1 month"
    const monthRange = parseMonthParam(month);
    if (monthRange) {
        return { start: monthRange.start, end: monthRange.end, dateTrunc: 'day', interval: '1 day' };
    }

    const now = new Date();
    const start = new Date(now);

    // Default: rolling windows
    if (timespan === 'day') start.setHours(start.getHours() - 23);
    else if (timespan === 'week') start.setDate(start.getDate() - 6);
    else if (timespan === 'month') start.setMonth(start.getMonth() - 1);
    else if (timespan === 'year') start.setFullYear(start.getFullYear() - 1);
    else start.setDate(start.getDate() - 6);

    const dateTruncMap = { day: 'hour', week: 'day', month: 'day', year: 'month' };
    const dateTrunc = dateTruncMap[timespan] || 'day';
    const interval = `1 ${dateTrunc}`;

    return { start, end: now, dateTrunc, interval };
}

function getPreviousPeriod(start, end) {
    const durationMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(start.getTime() - durationMs);
    return { prevStart, prevEnd };
}

exports.getUsageStats = async (req, res) => {
    const { timespan = 'week', model, businessPartnerId, month, compare = 'true' } = req.query;

    const { start, end, dateTrunc, interval } = getTimeframe(timespan, month);
    const { prevStart, prevEnd } = getPreviousPeriod(start, end);
    const doCompare = String(compare).toLowerCase() !== 'false';

    // Parameterreihenfolge:
    // $1 = start, $2 = end, $3 = bpId (nullable)
    const params = [start, end, businessPartnerId || null];

    const loginActionTypesSql = LOGIN_ACTION_TYPES.map((_, idx) => `$${idx + 4}`).join(', ');
    const paramsWithLoginTypes = [...params, ...LOGIN_ACTION_TYPES]; // $4..$6

    try {
        // -------------------------
        // 1) Time Series
        // -------------------------
        // Wir bauen eine Serie von Perioden (hour/day/month), und joinen Logins/Tokens/Community dazu.
        const timeSeriesQuery = `
            WITH time_series AS (
                SELECT generate_series(
                    date_trunc('${dateTrunc}', $1::timestamptz),
                    date_trunc('${dateTrunc}', ($2::timestamptz - interval '${interval}')),
                    interval '${interval}'
                ) AS period
            )
            SELECT
                ts.period,
                COALESCE(logins.count, 0) AS login_count,
                COALESCE(tokens.prompt, 0) AS prompt_tokens,
                COALESCE(tokens.completion, 0) AS completion_tokens,
                COALESCE(funding_tokens.total, 0) AS funding_tokens,
                COALESCE(posts.count, 0) AS new_posts,
                COALESCE(comments.count, 0) AS new_comments
            FROM time_series ts
            -- Logins
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', al.timestamp) as period, COUNT(*)::int as count
                FROM activity_log al
                JOIN users u ON al.user_id = u.id
                WHERE al.timestamp >= $1 AND al.timestamp < $2
                  AND al.status = 'success'
                  AND al.action_type IN (${loginActionTypesSql})
                  AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
                GROUP BY period
            ) AS logins ON ts.period = logins.period
            -- Tokens (Redactional)
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', al.timestamp) as period,
                       SUM((al.details->'tokenUsage'->>'promptTokens')::int)::bigint as prompt,
                       SUM((al.details->'tokenUsage'->>'completionTokens')::int)::bigint as completion
                FROM activity_log al
                JOIN users u ON al.user_id = u.id
                WHERE al.timestamp >= $1 AND al.timestamp < $2
                  AND al.action_type LIKE 'AI_%_SUCCESS'
                  AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
                GROUP BY period
            ) AS tokens ON ts.period = tokens.period
            -- Funding Tokens (aus Jobs)
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', aul.created_at) as period,
                       SUM(aul.total_tokens)::bigint as total
                FROM ai_usage_logs aul
                JOIN ai_jobs aj ON aul.job_id = aj.id
                JOIN scraping_rules sr ON aj.scraping_rule_id = sr.id
                WHERE sr.rule_type = 'funding'
                  AND aul.created_at >= $1 AND aul.created_at < $2
                  AND ($3::uuid IS NULL OR aul.business_partner_id = $3::uuid)
                GROUP BY period
            ) AS funding_tokens ON ts.period = funding_tokens.period
            -- Community Posts
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', created_at) as period, COUNT(*)::int as count
                FROM community_posts
                WHERE created_at >= $1 AND created_at < $2
                  AND ($3::uuid IS NULL OR business_partner_id = $3::uuid)
                GROUP BY period
            ) AS posts ON ts.period = posts.period
            -- Community Comments (BP via User)
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', cc.created_at) as period, COUNT(*)::int as count
                FROM community_comments cc
                WHERE cc.created_at >= $1 AND cc.created_at < $2
                  AND ($3::uuid IS NULL OR cc.user_id IN (SELECT id FROM users WHERE business_partner_id = $3::uuid))
                GROUP BY period
            ) AS comments ON ts.period = comments.period
            ORDER BY ts.period ASC;
        `;
        const timeSeriesPromise = db.query(timeSeriesQuery, paramsWithLoginTypes);

        // -------------------------
        // 2) KPI (aktueller Zeitraum)
        // -------------------------
        const kpiQuery = `
            SELECT
                -- Logins
                (SELECT COUNT(*)::int
                 FROM activity_log al JOIN users u ON al.user_id = u.id
                 WHERE al.timestamp >= $1 AND al.timestamp < $2
                   AND al.status = 'success'
                   AND al.action_type IN (${loginActionTypesSql})
                   AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
                ) AS total_logins,

                -- Unique Login Users
                (SELECT COUNT(DISTINCT al.user_id)::int
                 FROM activity_log al JOIN users u ON al.user_id = u.id
                 WHERE al.timestamp >= $1 AND al.timestamp < $2
                   AND al.status = 'success'
                   AND al.action_type IN (${loginActionTypesSql})
                   AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
                ) AS unique_login_users,

                -- AI Content
                (SELECT COUNT(*)::int
                 FROM ai_generated_content agc JOIN users u ON agc.user_id = u.id
                 WHERE agc.created_at >= $1 AND agc.created_at < $2
                   AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
                ) AS total_ai_content,

                -- Scraped Content (Zeilen)
                (SELECT COUNT(*)::int
                 FROM scraped_content sc
                 WHERE sc.scraped_at >= $1 AND sc.scraped_at < $2
                ) AS total_scraped_content,

                -- Scraping Jobs (completed)
                (SELECT COUNT(*)::int
                 FROM scraping_jobs sj
                 WHERE sj.status = 'completed'
                   AND sj.completed_at >= $1 AND sj.completed_at < $2
                ) AS total_scraping_jobs_completed,

                -- Tokens: Redactional (Activity Log)
                (SELECT COALESCE(SUM((al.details->'tokenUsage'->>'totalTokens')::int), 0)::bigint
                 FROM activity_log al JOIN users u ON al.user_id = u.id
                 WHERE al.timestamp >= $1 AND al.timestamp < $2
                   AND al.action_type LIKE 'AI_%_SUCCESS'
                   AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
                ) AS total_redactional_tokens,

                -- Tokens: Usage Logs (alle Jobs)
                (SELECT COALESCE(SUM(aul.total_tokens), 0)::bigint
                 FROM ai_usage_logs aul
                 WHERE aul.created_at >= $1 AND aul.created_at < $2
                   AND ($3::uuid IS NULL OR aul.business_partner_id = $3::uuid)
                ) AS total_usage_log_tokens,

                -- Tokens: Funding (subset)
                (SELECT COALESCE(SUM(aul.total_tokens), 0)::bigint
                 FROM ai_usage_logs aul
                 JOIN ai_jobs aj ON aul.job_id = aj.id
                 JOIN scraping_rules sr ON aj.scraping_rule_id = sr.id
                 WHERE sr.rule_type = 'funding'
                   AND aul.created_at >= $1 AND aul.created_at < $2
                   AND ($3::uuid IS NULL OR aul.business_partner_id = $3::uuid)
                ) AS total_funding_tokens,

                -- Funding processed opportunities (count)
                (SELECT COUNT(aul.id)::int
                 FROM ai_usage_logs aul
                 JOIN ai_jobs aj ON aul.job_id = aj.id
                 JOIN scraping_rules sr ON aj.scraping_rule_id = sr.id
                 WHERE sr.rule_type = 'funding'
                   AND aul.created_at >= $1 AND aul.created_at < $2
                   AND ($3::uuid IS NULL OR aul.business_partner_id = $3::uuid)
                ) AS total_processed_opportunities,

                -- AI Requests (count)
                (
                    (SELECT COUNT(*)::int
                     FROM activity_log al JOIN users u ON al.user_id = u.id
                     WHERE al.timestamp >= $1 AND al.timestamp < $2
                       AND al.action_type LIKE 'AI_%_SUCCESS'
                       AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
                    )
                    +
                    (SELECT COUNT(*)::int
                     FROM ai_usage_logs aul
                     WHERE aul.created_at >= $1 AND aul.created_at < $2
                       AND ($3::uuid IS NULL OR aul.business_partner_id = $3::uuid)
                    )
                ) AS total_ai_requests,

                -- Community KPIs
                (SELECT COUNT(*)::int
                 FROM community_posts
                 WHERE created_at >= $1 AND created_at < $2
                   AND ($3::uuid IS NULL OR business_partner_id = $3::uuid)
                ) AS total_community_posts,

                (SELECT COUNT(*)::int
                 FROM community_comments cc
                 WHERE cc.created_at >= $1 AND cc.created_at < $2
                   AND ($3::uuid IS NULL OR cc.user_id IN (SELECT id FROM users WHERE business_partner_id = $3::uuid))
                ) AS total_community_comments,

                (SELECT COUNT(*)::int
                 FROM community_likes cl
                 WHERE cl.created_at >= $1 AND cl.created_at < $2
                   AND ($3::uuid IS NULL OR cl.user_id IN (SELECT id FROM users WHERE business_partner_id = $3::uuid))
                ) AS total_community_likes
        `;
        const kpiPromise = db.query(kpiQuery, paramsWithLoginTypes).then((r) => r.rows[0]);

        // Optional: KPIs für Vergleichszeitraum (z.B. Vormonat / Vorwoche etc.)
        const comparisonKpiPromise = doCompare
            ? db.query(kpiQuery, [prevStart, prevEnd, businessPartnerId || null, ...LOGIN_ACTION_TYPES]).then((r) => r.rows[0])
            : Promise.resolve(null);

        // -------------------------
        // 3) Provider Usage
        // -------------------------
        // Filter: Zeitraum + optional BP + optional Model
        const providerUsageQuery = `
            WITH all_usage AS (
                SELECT
                    u.business_partner_id,
                    al.details->>'model' as model,
                    (al.details->'tokenUsage'->>'promptTokens')::int as prompt_tokens,
                    (al.details->'tokenUsage'->>'completionTokens')::int as completion_tokens
                FROM activity_log al
                JOIN users u ON al.user_id = u.id
                WHERE al.timestamp >= $1 AND al.timestamp < $2
                  AND al.action_type LIKE 'AI_%_SUCCESS'
                  AND al.details->>'model' IS NOT NULL

                UNION ALL

                SELECT
                    aul.business_partner_id,
                    aul.model,
                    aul.prompt_tokens,
                    aul.completion_tokens
                FROM ai_usage_logs aul
                WHERE aul.created_at >= $1 AND aul.created_at < $2
                  AND aul.model IS NOT NULL
            )
            SELECT model,
                   COUNT(*)::int as requests,
                   COALESCE(SUM(prompt_tokens), 0)::bigint as prompt_tokens,
                   COALESCE(SUM(completion_tokens), 0)::bigint as completion_tokens
            FROM all_usage au
            WHERE ($3::uuid IS NULL OR au.business_partner_id = $3::uuid)
              AND ($4::text IS NULL OR au.model = $4::text)
            GROUP BY model
            HAVING COALESCE(SUM(prompt_tokens),0) > 0 OR COALESCE(SUM(completion_tokens),0) > 0
            ORDER BY model;
        `;
        // $4 ist das optionale Model
        const providerUsagePromise = db.query(providerUsageQuery, [start, end, businessPartnerId || null, model || null]);

        // -------------------------
        // 4) Kosten pro BP
        // -------------------------
        const costPerBpQuery = `
            WITH all_usage AS (
                SELECT u.business_partner_id,
                       (al.details->'tokenUsage'->>'totalTokens')::int as total_tokens
                FROM activity_log al
                JOIN users u ON al.user_id = u.id
                WHERE al.timestamp >= $1 AND al.timestamp < $2
                  AND al.action_type LIKE 'AI_%_SUCCESS'
                  AND u.business_partner_id IS NOT NULL

                UNION ALL

                SELECT aul.business_partner_id,
                       aul.total_tokens::int as total_tokens
                FROM ai_usage_logs aul
                WHERE aul.created_at >= $1 AND aul.created_at < $2
                  AND aul.business_partner_id IS NOT NULL
            )
            SELECT bp.name,
                   COALESCE(SUM(au.total_tokens), 0)::bigint as total_tokens
            FROM all_usage au
            JOIN business_partners bp ON au.business_partner_id = bp.id
            WHERE ($3::uuid IS NULL OR au.business_partner_id = $3::uuid)
            GROUP BY bp.name
            HAVING COALESCE(SUM(au.total_tokens), 0) > 0
            ORDER BY total_tokens DESC;
        `;
        const costPerBpPromise = db.query(costPerBpQuery, params);

        // -------------------------
        // 5) Kategorie Verteilung
        // -------------------------
        const categoryDistributionQuery = `
            SELECT c.name, COUNT(agc.id)::INT as count
            FROM ai_generated_content agc
            JOIN categories c ON agc.category_id = c.id
            JOIN users u ON agc.user_id = u.id
            WHERE agc.created_at >= $1 AND agc.created_at < $2
              AND ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
            GROUP BY c.name
            HAVING COUNT(agc.id) > 0
            ORDER BY count DESC;
        `;
        const categoryDistributionPromise = db.query(categoryDistributionQuery, params);

        // -------------------------
        // 6) Top User Activity (System & Community)
        // -------------------------
        const topUserActivityQuery = `
            SELECT
                u.id AS user_id,
                u.username,
                u.first_name,
                u.last_name,
                u.email,
                u.organization_name,
                u.profile_image_url,
                bp.name as business_partner_name,
                (
                    COUNT(DISTINCT al.id) +
                    (SELECT COUNT(*) FROM community_posts p WHERE p.user_id = u.id AND p.created_at >= $1 AND p.created_at < $2) +
                    (SELECT COUNT(*) FROM community_comments c WHERE c.user_id = u.id AND c.created_at >= $1 AND c.created_at < $2)
                )::INT as activity_count
            FROM users u
            LEFT JOIN activity_log al
              ON al.user_id = u.id
             AND al.timestamp >= $1 AND al.timestamp < $2
             AND (
                (al.status = 'success' AND al.action_type IN (${loginActionTypesSql}))
                OR al.action_type LIKE 'AI_%_SUCCESS'
             )
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
            WHERE ($3::uuid IS NULL OR u.business_partner_id = $3::uuid)
            GROUP BY u.id, u.email, bp.name
            HAVING (
                COUNT(DISTINCT al.id) +
                (SELECT COUNT(*) FROM community_posts p WHERE p.user_id = u.id AND p.created_at >= $1 AND p.created_at < $2) +
                (SELECT COUNT(*) FROM community_comments c WHERE c.user_id = u.id AND c.created_at >= $1 AND c.created_at < $2)
            ) > 0
            ORDER BY activity_count DESC
            LIMIT 10;
        `;
        const topUserActivityPromise = db.query(topUserActivityQuery, paramsWithLoginTypes);

        // -------------------------
        // 7) Dropdowns
        // -------------------------
        const availableModelsPromise = db.query(`
            SELECT DISTINCT model FROM ai_usage_logs WHERE model IS NOT NULL
            UNION
            SELECT DISTINCT details->>'model' as model FROM activity_log WHERE details->>'model' IS NOT NULL;
        `);
        const businessPartnersPromise = db.query(`SELECT id, name FROM business_partners ORDER BY name ASC;`);

        const [
            timeSeriesResult,
            kpis,
            comparisonKpis,
            providerUsageResult,
            availableModelsResult,
            businessPartnersResult,
            costPerBpResult,
            categoryDistributionResult,
            topUserActivityResult
        ] = await Promise.all([
            timeSeriesPromise,
            kpiPromise,
            comparisonKpiPromise,
            providerUsagePromise,
            availableModelsPromise,
            businessPartnersPromise,
            costPerBpPromise,
            categoryDistributionPromise,
            topUserActivityPromise
        ]);

        // Derived fields (server-side, damit Frontend nicht raten muss)
        const totalTokensOverall =
            (Number(kpis.total_redactional_tokens || 0) || 0) + (Number(kpis.total_usage_log_tokens || 0) || 0);

        const comparisonTotalTokensOverall = comparisonKpis
            ? ((Number(comparisonKpis.total_redactional_tokens || 0) || 0) + (Number(comparisonKpis.total_usage_log_tokens || 0) || 0))
            : null;

        res.json({
            timeframe: {
                start: start.toISOString(),
                end: end.toISOString(),
                previousStart: prevStart.toISOString(),
                previousEnd: prevEnd.toISOString()
            },
            timeSeries: timeSeriesResult.rows,
            kpis: {
                ...kpis,
                total_tokens_overall: String(totalTokensOverall)
            },
            comparisonKpis: comparisonKpis
                ? { ...comparisonKpis, total_tokens_overall: String(comparisonTotalTokensOverall ?? 0) }
                : null,
            providerUsage: providerUsageResult.rows,
            availableModels: availableModelsResult.rows.map((r) => r.model).filter(Boolean),
            businessPartners: businessPartnersResult.rows,
            costPerBusinessPartner: costPerBpResult.rows,
            categoryDistribution: categoryDistributionResult.rows,
            topUserActivity: topUserActivityResult.rows
        });
    } catch (err) {
        console.error('Error fetching usage stats:', err.message, err.stack);
        res.status(500).send('Server error');
    }
};
