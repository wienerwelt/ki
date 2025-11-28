// backend/controllers/adminStatsController.js
const db = require('../config/db');

const getTimeframe = (timespan) => {
    const intervalMap = { day: 'hour', week: 'day', month: 'day', year: 'month' };
    const dateTrunc = intervalMap[timespan] || 'day';
    const timeFilterMap = {
        day: "NOW() - INTERVAL '23 hours'",
        week: "NOW() - INTERVAL '6 days'",
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
        // Basis-Parameter für Filterung (Business Partner)
        const baseParams = [];
        let baseWhereClauses = [`timestamp >= ${timeFilter}`]; // Für Activity Log
        let communityWhereClauses = [`created_at >= ${timeFilter}`]; // Für Community Tabellen

        if (businessPartnerId) {
            baseParams.push(businessPartnerId);
            baseWhereClauses.push(`u.business_partner_id = $${baseParams.length}`);
            communityWhereClauses.push(`business_partner_id = $${baseParams.length}`); // Achtung: User Join nötig für Comments/Likes
        }
        
        const baseWhereString = `WHERE ${baseWhereClauses.join(' AND ')}`;
        const communityWhereString = `WHERE ${communityWhereClauses.join(' AND ')}`;
        
        // Helper für Community-Filterung (Posts haben direkt BP_ID, Kommentare/Likes via User)
        const commPostFilter = businessPartnerId ? `AND business_partner_id = '${businessPartnerId}'` : '';
        const commUserFilter = businessPartnerId ? `AND user_id IN (SELECT id FROM users WHERE business_partner_id = '${businessPartnerId}')` : '';


        // 1. Zeitreihe (Erweitert um Community)
        const timeSeriesQuery = `
            WITH time_series AS (
                SELECT generate_series(date_trunc('${dateTrunc}', ${timeFilter}), date_trunc('${dateTrunc}', NOW() + '${interval}'::interval), '${interval}'::interval) AS period
            )
            SELECT
                ts.period,
                COALESCE(logins.count, 0) AS login_count,
                COALESCE(tokens.prompt, 0) AS prompt_tokens,
                COALESCE(tokens.completion, 0) AS completion_tokens,
                COALESCE(funding_tokens.total, 0) AS funding_tokens,
                -- NEU: Community Stats
                COALESCE(posts.count, 0) AS new_posts,
                COALESCE(comments.count, 0) AS new_comments
            FROM time_series ts
            -- Logins
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', timestamp) as period, count(*) as count 
                FROM activity_log al JOIN users u ON al.user_id = u.id 
                ${baseWhereString} AND action_type = 'USER_LOGIN' 
                GROUP BY period
            ) AS logins ON ts.period = logins.period
            -- Tokens
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', timestamp) as period, SUM((details->'tokenUsage'->>'promptTokens')::int) as prompt, SUM((details->'tokenUsage'->>'completionTokens')::int) as completion 
                FROM activity_log al JOIN users u ON al.user_id = u.id 
                ${baseWhereString} AND action_type LIKE 'AI_%_SUCCESS' 
                GROUP BY period
            ) AS tokens ON ts.period = tokens.period
            -- Funding Tokens
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', aul.created_at) as period, SUM(aul.total_tokens) as total 
                FROM ai_usage_logs aul 
                JOIN ai_jobs aj ON aul.job_id = aj.id 
                JOIN scraping_rules sr ON aj.scraping_rule_id = sr.id 
                WHERE sr.rule_type = 'funding' AND aul.created_at >= ${timeFilter} 
                GROUP BY period
            ) AS funding_tokens ON ts.period = funding_tokens.period
            -- NEU: Community Posts
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', created_at) as period, COUNT(*) as count 
                FROM community_posts 
                WHERE created_at >= ${timeFilter} ${commPostFilter}
                GROUP BY period
            ) AS posts ON ts.period = posts.period
            -- NEU: Community Comments
            LEFT JOIN (
                SELECT date_trunc('${dateTrunc}', created_at) as period, COUNT(*) as count 
                FROM community_comments 
                WHERE created_at >= ${timeFilter} ${commUserFilter}
                GROUP BY period
            ) AS comments ON ts.period = comments.period

            WHERE ts.period <= NOW()
            ORDER BY ts.period ASC;
        `;
        const timeSeriesPromise = db.query(timeSeriesQuery, baseParams);

        // 2. KPIs (Erweitert)
        const kpiQuery = `
            SELECT
                (SELECT COUNT(*) FROM activity_log al JOIN users u ON al.user_id = u.id ${baseWhereString} AND al.action_type = 'USER_LOGIN') as total_logins,
                (SELECT COUNT(*) FROM ai_generated_content agc JOIN users u ON agc.user_id = u.id ${baseWhereString.replace('timestamp', 'agc.created_at')}) as total_ai_content,
                (SELECT COUNT(*) FROM scraped_content WHERE scraped_at >= ${timeFilter}) as total_scraped_content,
                (SELECT SUM((al.details->'tokenUsage'->>'totalTokens')::int) FROM activity_log al JOIN users u ON al.user_id = u.id ${baseWhereString} AND al.action_type LIKE 'AI_%_SUCCESS') as total_redactional_tokens,
                (SELECT SUM(aul.total_tokens) FROM ai_usage_logs aul JOIN ai_jobs aj ON aul.job_id = aj.id JOIN scraping_rules sr ON aj.scraping_rule_id = sr.id WHERE sr.rule_type = 'funding' AND aul.created_at >= ${timeFilter}) as total_funding_tokens,
                (SELECT COUNT(aul.id) FROM ai_usage_logs aul JOIN ai_jobs aj ON aul.job_id = aj.id JOIN scraping_rules sr ON aj.scraping_rule_id = sr.id WHERE sr.rule_type = 'funding' AND aul.created_at >= ${timeFilter}) as total_processed_opportunities,
                -- NEU: Community KPIs
                (SELECT COUNT(*) FROM community_posts WHERE created_at >= ${timeFilter} ${commPostFilter}) as total_community_posts,
                (SELECT COUNT(*) FROM community_comments WHERE created_at >= ${timeFilter} ${commUserFilter}) as total_community_comments,
                (SELECT COUNT(*) FROM community_likes WHERE created_at >= ${timeFilter} ${commUserFilter}) as total_community_likes
        `;
        const kpiPromise = db.query(kpiQuery, baseParams).then(res => res.rows[0]);

        // 3. Provider Usage (Unverändert)
        const providerUsageQuery = `
            WITH all_usage AS (
                SELECT u.business_partner_id, al.details->>'model' as model, (al.details->'tokenUsage'->>'promptTokens')::int as prompt_tokens, (al.details->'tokenUsage'->>'completionTokens')::int as completion_tokens
                FROM activity_log al
                JOIN users u ON al.user_id = u.id
                WHERE al.timestamp >= ${timeFilter} AND al.action_type LIKE 'AI_%_SUCCESS' AND al.details->>'model' IS NOT NULL
                UNION ALL
                SELECT aul.business_partner_id, aul.model, aul.prompt_tokens, aul.completion_tokens
                FROM ai_usage_logs aul
                WHERE aul.created_at >= ${timeFilter} AND aul.model IS NOT NULL
            )
            SELECT model, COUNT(*) as requests, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens
            FROM all_usage au
            WHERE ($1::uuid IS NULL OR au.business_partner_id = $1::uuid)
            AND ($2::text IS NULL OR au.model = $2::text)
            GROUP BY model HAVING SUM(prompt_tokens) > 0 OR SUM(completion_tokens) > 0
            ORDER BY model;
        `;
        const providerUsagePromise = db.query(providerUsageQuery, [businessPartnerId || null, model || null]);

        // 4. Kosten pro BP (Unverändert)
        const costPerBpQuery = `
            WITH all_usage AS (
                SELECT u.business_partner_id, (al.details->'tokenUsage'->>'totalTokens')::int as total_tokens
                FROM activity_log al
                JOIN users u ON al.user_id = u.id
                WHERE al.timestamp >= ${timeFilter} AND al.action_type LIKE 'AI_%_SUCCESS' AND u.business_partner_id IS NOT NULL
                UNION ALL
                SELECT aul.business_partner_id, aul.total_tokens
                FROM ai_usage_logs aul
                WHERE aul.created_at >= ${timeFilter} AND aul.business_partner_id IS NOT NULL
            )
            SELECT bp.name, SUM(au.total_tokens) as total_tokens
            FROM all_usage au
            JOIN business_partners bp ON au.business_partner_id = bp.id
            GROUP BY bp.name
            HAVING SUM(au.total_tokens) > 0
            ORDER BY total_tokens DESC;
        `;
        const costPerBpPromise = db.query(costPerBpQuery);

        // 5. Kategorie Verteilung (Unverändert)
        const categoryDistributionQuery = `
            SELECT c.name, COUNT(agc.id)::INT as count
            FROM ai_generated_content agc
            JOIN categories c ON agc.category_id = c.id
            JOIN users u ON agc.user_id = u.id
            ${baseWhereString.replace('timestamp', 'agc.created_at')}
            GROUP BY c.name
            HAVING COUNT(agc.id) > 0
            ORDER BY count DESC;
        `;
        const categoryDistributionPromise = db.query(categoryDistributionQuery, baseParams);

        // 6. Top User (Erweitert um Community Aktivität)
        const topUserActivityQuery = `
            SELECT 
                u.email, 
                bp.name as business_partner_name, 
                (
                    COUNT(DISTINCT al.id) + 
                    (SELECT COUNT(*) FROM community_posts p WHERE p.user_id = u.id AND p.created_at >= ${timeFilter}) +
                    (SELECT COUNT(*) FROM community_comments c WHERE c.user_id = u.id AND c.created_at >= ${timeFilter})
                )::INT as activity_count
            FROM users u
            LEFT JOIN activity_log al ON al.user_id = u.id AND al.timestamp >= ${timeFilter} AND (al.action_type = 'USER_LOGIN' OR al.action_type LIKE 'AI_%_SUCCESS')
            LEFT JOIN business_partners bp ON u.business_partner_id = bp.id
            ${baseWhereString.replace('timestamp', 'al.timestamp').replace('AND al.action_type', '')} -- Grober Filter auf User Ebene via Join
            GROUP BY u.id, u.email, bp.name
            HAVING (
                COUNT(DISTINCT al.id) + 
                (SELECT COUNT(*) FROM community_posts p WHERE p.user_id = u.id AND p.created_at >= ${timeFilter}) +
                (SELECT COUNT(*) FROM community_comments c WHERE c.user_id = u.id AND c.created_at >= ${timeFilter})
            ) > 0
            ORDER BY activity_count DESC
            LIMIT 10;
        `;
        // Hinweis: Die Query oben ist etwas komplexer, um alles zu aggregieren.
        // Vereinfachung: Wir zählen Logins + AI-Nutzung + Posts + Kommentare zusammen.
        const topUserActivityPromise = db.query(topUserActivityQuery, baseParams);

        // 7. Dropdowns (Unverändert)
        const availableModelsPromise = db.query(`SELECT DISTINCT model FROM ai_usage_logs WHERE model IS NOT NULL UNION SELECT DISTINCT details->>'model' as model FROM activity_log WHERE details->>'model' IS NOT NULL;`);
        const businessPartnersPromise = db.query(`SELECT id, name FROM business_partners ORDER BY name ASC;`);

        const [
            timeSeriesResult, kpis, providerUsageResult, availableModelsResult, businessPartnersResult,
            costPerBpResult, categoryDistributionResult, topUserActivityResult
        ] = await Promise.all([
            timeSeriesPromise, kpiPromise, providerUsagePromise, availableModelsPromise, businessPartnersPromise,
            costPerBpPromise, categoryDistributionPromise, topUserActivityPromise
        ]);

        res.json({
            timeSeries: timeSeriesResult.rows,
            kpis,
            providerUsage: providerUsageResult.rows,
            availableModels: availableModelsResult.rows.map(r => r.model).filter(Boolean),
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