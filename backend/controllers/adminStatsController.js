// backend/controllers/adminStatsController.js
const db = require('../config/db');

// Hilfsfunktion zur Bestimmung des Zeitintervalls und Filters für die SQL-Abfrage
const getTimeframe = (timespan) => {
    const intervalMap = { day: 'hour', week: 'day', month: 'day', year: 'month' };
    const dateTrunc = intervalMap[timespan] || 'day';
    const timeFilterMap = {
        day: "NOW() - INTERVAL '24 hours'",
        week: "NOW() - INTERVAL '7 days'",
        month: "NOW() - INTERVAL '1 month'",
        year: "NOW() - INTERVAL '1 year'"
    };
    const timeFilter = timeFilterMap[timespan] || "NOW() - INTERVAL '7 days'";
    return { dateTrunc, timeFilter, interval: `1 ${dateTrunc}` };
};

exports.getUsageStats = async (req, res) => {
    const { timespan = 'week', model, businessPartnerId } = req.query;
    const { dateTrunc, timeFilter, interval } = getTimeframe(timespan);

    try {
        // --- Dynamische Erstellung der WHERE-Klauseln und Parameter ---

        // Parameter und Klauseln für die 'activity_log' Tabelle
        const logParams = [];
        let logWhereClauses = [`timestamp >= ${timeFilter}`];
        if (model) {
            logParams.push(model);
            logWhereClauses.push(`details->>'model' = $${logParams.length}`);
        }
        if (businessPartnerId) {
            logParams.push(businessPartnerId);
            logWhereClauses.push(`user_id IN (SELECT id FROM users WHERE business_partner_id = $${logParams.length})`);
        }
        const logWhereString = `WHERE ${logWhereClauses.join(' AND ')}`;

        // Parameter und Klauseln für die 'ai_generated_content' Tabelle
        const contentParams = [];
        let contentWhereClauses = [`created_at >= ${timeFilter}`];
        if (businessPartnerId) {
            contentParams.push(businessPartnerId);
            contentWhereClauses.push(`user_id IN (SELECT id FROM users WHERE business_partner_id = $${contentParams.length})`);
        }
        const contentWhereString = `WHERE ${contentWhereClauses.join(' AND ')}`;
        
        // --- Abfrage 1: Zeitreihendaten ---
        const timeSeriesQuery = `
            WITH time_series AS (
                SELECT generate_series(date_trunc('${dateTrunc}', ${timeFilter}), date_trunc('${dateTrunc}', NOW()), '${interval}'::interval) AS period
            )
            SELECT
                ts.period,
                COALESCE(logins.count, 0) AS login_count,
                COALESCE(openai.count, 0) AS openai_requests,
                COALESCE(gemini.count, 0) AS gemini_requests,
                COALESCE(tokens.prompt, 0) AS prompt_tokens,
                COALESCE(tokens.completion, 0) AS completion_tokens
            FROM time_series ts
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', timestamp) as period, count(*) as count
                FROM activity_log ${logWhereString} AND action_type = 'USER_LOGIN' GROUP BY period
            ) AS logins ON ts.period = logins.period
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', timestamp) as period, count(*) as count
                FROM activity_log ${logWhereString} AND action_type LIKE 'AI_%_SUCCESS' AND (details->>'provider' LIKE 'OpenAI%' OR details->>'model' LIKE 'gpt%') GROUP BY period
            ) AS openai ON ts.period = openai.period
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', timestamp) as period, count(*) as count
                FROM activity_log ${logWhereString} AND action_type LIKE 'AI_%_SUCCESS' AND (details->>'provider' LIKE 'Google%' OR details->>'model' LIKE 'gemini%') GROUP BY period
            ) AS gemini ON ts.period = gemini.period
            LEFT JOIN (
                SELECT 
                    date_trunc('${dateTrunc}', timestamp) as period, 
                    SUM((details->'tokenUsage'->>'promptTokens')::int) as prompt,
                    SUM((details->'tokenUsage'->>'completionTokens')::int) as completion
                FROM activity_log ${logWhereString} AND action_type LIKE 'AI_%_SUCCESS' GROUP BY period
            ) AS tokens ON ts.period = tokens.period
            ORDER BY ts.period ASC;
        `;
        const timeSeriesPromise = db.query(timeSeriesQuery, logParams);

        // --- Abfrage 2: KPI-Karten (jetzt als separate Abfragen) ---
        const kpiPromise = Promise.all([
            db.query(`SELECT COUNT(*) as total_logins FROM activity_log ${logWhereString} AND action_type = 'USER_LOGIN'`, logParams),
            db.query(`SELECT COUNT(*) as total_ai_content FROM ai_generated_content ${contentWhereString}`, contentParams),
            db.query(`SELECT COUNT(*) as total_scraped_content FROM scraped_content WHERE scraped_at >= ${timeFilter}`),
            db.query(`SELECT SUM((details->'tokenUsage'->>'promptTokens')::int) as total_prompt_tokens FROM activity_log ${logWhereString} AND action_type LIKE 'AI_%_SUCCESS'`, logParams),
            db.query(`SELECT SUM((details->'tokenUsage'->>'completionTokens')::int) as total_completion_tokens FROM activity_log ${logWhereString} AND action_type LIKE 'AI_%_SUCCESS'`, logParams)
        ]).then(results => ({
            total_logins: results[0].rows[0].total_logins,
            total_ai_content: results[1].rows[0].total_ai_content,
            total_scraped_content: results[2].rows[0].total_scraped_content,
            total_prompt_tokens: results[3].rows[0].total_prompt_tokens,
            total_completion_tokens: results[4].rows[0].total_completion_tokens,
        }));

        // --- Abfrage 3 & 4: Provider-Nutzung und verfügbare Modelle ---
        const providerUsageQuery = `
            SELECT 
                COALESCE(
                    details->>'provider',
                    CASE 
                        WHEN details->>'model' LIKE 'gpt%' THEN 'OpenAI'
                        WHEN details->>'model' LIKE 'gemini%' THEN 'Google'
                        ELSE 'Unbekannt'
                    END
                ) as provider, 
                details->>'model' as model, 
                COUNT(*) as requests, 
                SUM((details->'tokenUsage'->>'promptTokens')::int) as prompt_tokens,
                SUM((details->'tokenUsage'->>'completionTokens')::int) as completion_tokens
            FROM activity_log
            ${logWhereString} AND action_type LIKE 'AI_%_SUCCESS'
            GROUP BY provider, model
            ORDER BY provider, model;
        `;
        const providerUsagePromise = db.query(providerUsageQuery, logParams);
        const availableModelsPromise = db.query(`SELECT DISTINCT details->>'model' as model FROM activity_log WHERE details->>'model' IS NOT NULL;`);
        const businessPartnersPromise = db.query(`SELECT id, name FROM business_partners ORDER BY name ASC;`);

        // --- Alle Abfragen parallel ausführen ---
        const [timeSeriesResult, kpis, providerUsageResult, availableModelsResult, businessPartnersResult] = await Promise.all([
            timeSeriesPromise,
            kpiPromise,
            providerUsagePromise,
            availableModelsPromise,
            businessPartnersPromise
        ]);

        res.json({
            timeSeries: timeSeriesResult.rows,
            kpis,
            providerUsage: providerUsageResult.rows,
            availableModels: availableModelsResult.rows.map(r => r.model),
            businessPartners: businessPartnersResult.rows
        });
    } catch (err) {
        console.error('Error fetching usage stats:', err.message, err.stack);
        res.status(500).send('Server error');
    }
};
