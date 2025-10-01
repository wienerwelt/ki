const db = require('../config/db');

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

exports.getAllFundingOpportunities = async (req, res) => {
    const { q, orderBy = 'created_at', order = 'DESC', sourceRuleId, categoryId } = req.query;

    const validOrderColumns = ['title', 'source_name', 'region', 'deadline_end', 'created_at'];
    const sortColumn = validOrderColumns.includes(orderBy) ? orderBy : 'created_at';
    const sortDirection = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    try {
        const queryParams = [];
        const whereClauses = [];

        if (q && q.trim() !== '') {
            queryParams.push(`%${q.trim()}%`);
            whereClauses.push(`f.title ILIKE $${queryParams.length}`);
        }
        if (sourceRuleId) {
            queryParams.push(sourceRuleId);
            whereClauses.push(`f.source_rule_id = $${queryParams.length}`);
        }
        if (categoryId) {
            queryParams.push(categoryId);
            whereClauses.push(`f.id IN (
                SELECT opportunity_id FROM funding_opportunities_categories WHERE category_id = $${queryParams.length}
            )`);
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const query = `
            SELECT 
                f.id, f.title, f.original_url, f.deadline_end, f.funding_amount_max, 
                f.status, f.created_at, f.region, r.name as source_name,
                (
                    SELECT array_agg(fc.name) 
                    FROM funding_categories fc
                    JOIN funding_opportunities_categories foc ON fc.id = foc.category_id
                    WHERE foc.opportunity_id = f.id
                ) as categories
            FROM funding_opportunities f
            LEFT JOIN scraping_rules r ON f.source_rule_id = r.id
            ${whereString}
            ORDER BY ${sortColumn} ${sortDirection};
        `;

        const { rows } = await db.query(query, queryParams);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching funding opportunities:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getFundingSourceRules = async (_req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT id, name 
            FROM scraping_rules 
            WHERE rule_type = 'funding'
            ORDER BY name ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching funding source rules:', err.message);
        res.status(500).send('Server error');
    }
};

exports.updateFundingOpportunity = async (req, res) => {
    const { id } = req.params;
    const { title, deadline_end, status, region, category_ids } = req.body;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { rows: [updatedOpportunity] } = await client.query(
            `UPDATE funding_opportunities SET
                title = $1, deadline_end = $2, status = $3, region = $4, updated_at = NOW()
            WHERE id = $5 RETURNING *;`,
            [title, deadline_end || null, status, region || null, id]
        );
        if (!updatedOpportunity) throw new Error('Förderung nicht gefunden.');

        // Kategorien aktualisieren
        await client.query('DELETE FROM funding_opportunities_categories WHERE opportunity_id = $1', [id]);
        if (Array.isArray(category_ids) && category_ids.length > 0) {
            for (const catId of category_ids) {
                await client.query(
                    'INSERT INTO funding_opportunities_categories (opportunity_id, category_id) VALUES ($1, $2)',
                    [id, catId]
                );
            }
        }

        await client.query('COMMIT');
        res.json(updatedOpportunity);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error updating funding opportunity ${id}:`, err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

exports.deleteFundingOpportunity = async (req, res) => {
    const { id } = req.params;

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM funding_opportunities_categories WHERE opportunity_id = $1', [id]);
        const result = await client.query('DELETE FROM funding_opportunities WHERE id = $1 RETURNING id', [id]);
        await client.query('COMMIT');

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Förderung nicht gefunden.' });
        }
        res.status(200).json({ message: 'Förderung erfolgreich gelöscht.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error deleting funding opportunity ${id}:`, err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

exports.getAllFundingCategories = async (_req, res) => {
    try {
        const { rows } = await db.query('SELECT id, name FROM funding_categories ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching funding categories:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getFundingUsageStats = async (req, res) => {
    const { timespan = 'month' } = req.query;

    const allowedTimespans = {
        day: { dateTrunc: 'hour', interval: '24 hours' },
        week: { dateTrunc: 'day', interval: '7 days' },
        month: { dateTrunc: 'day', interval: '1 month' },
        year: { dateTrunc: 'month', interval: '1 year' },
    };

    if (!allowedTimespans[timespan]) {
        return res.status(400).json({ message: 'Invalid timespan parameter.' });
    }
    const { interval } = allowedTimespans[timespan];

    try {
        const queryParams = [interval];

        const kpiQuery = `
            SELECT
                COUNT(aul.id)::INT AS total_processed_opportunities,
                SUM(aul.total_tokens)::BIGINT AS total_tokens
            FROM ai_usage_logs aul
            JOIN ai_jobs aj ON aul.job_id = aj.id
            JOIN scraping_rules sr ON aj.ai_prompt_rule_id = sr.id
            WHERE sr.rule_type = 'funding' AND aul.created_at >= (NOW() - $1::interval);
        `;
        const kpiPromise = db.query(kpiQuery, queryParams);

        const [kpiResult] = await Promise.all([kpiPromise]);

        res.json({
            kpis: kpiResult.rows[0] || { total_processed_opportunities: 0, total_tokens: 0 },
            timeSeries: [],
            sourceUsage: []
        });

    } catch (err) {
        console.error('Error fetching funding usage stats:', err.stack);
        res.status(500).send('Server error');
    }
};

exports.getAllRegions = async (_req, res) => {
    try {
        const { rows } = await db.query('SELECT name FROM public.regions ORDER BY name ASC');
        res.json(rows.map(r => r.name));
    } catch (err) {
        console.error('Error fetching regions:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getFundingDetailById = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT 
                f.*,
                r.name as source_name,
                (
                    SELECT array_agg(json_build_object('id', fc.id, 'name', fc.name))
                    FROM funding_categories fc
                    JOIN funding_opportunities_categories foc ON fc.id = foc.category_id
                    WHERE foc.opportunity_id = f.id
                ) as categories
            FROM funding_opportunities f
            LEFT JOIN scraping_rules r ON f.source_rule_id = r.id
            WHERE f.id = $1
        `;
        const { rows } = await db.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Förderung nicht gefunden.' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching funding detail by ID:', err.message);
        res.status(500).send('Server error');
    }
};

// --- Massenlöschung (transaktional & FK-sicher) ---
exports.deleteMultipleFundingOpportunities = async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Ein Array von IDs ist erforderlich.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        // Erst Zuordnungseinträge in der Zwischentabelle löschen
        await client.query(
            'DELETE FROM funding_opportunities_categories WHERE opportunity_id = ANY($1::uuid[])',
            [ids]
        );
        // Dann die Einträge in der Haupttabelle löschen
        const result = await client.query(
            'DELETE FROM funding_opportunities WHERE id = ANY($1::uuid[])',
            [ids]
        );
        await client.query('COMMIT');
        res.status(200).json({ message: `${result.rowCount} Einträge erfolgreich gelöscht.` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during bulk delete of funding opportunities:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

exports.getFundingStats = async (_req, res) => {
    try {
        const categoryQuery = `
            SELECT fc.name, COUNT(foc.opportunity_id)::INT as count 
            FROM funding_categories fc
            LEFT JOIN funding_opportunities_categories foc ON fc.id = foc.category_id
            GROUP BY fc.name 
            ORDER BY count DESC;
        `;

        const regionQuery = `
            SELECT region, COUNT(*)::INT as count 
            FROM funding_opportunities 
            WHERE region IS NOT NULL AND region <> ''
            GROUP BY region 
            ORDER BY count DESC;
        `;

        const sourceQuery = `
            SELECT r.name, COUNT(f.id)::INT as count
            FROM scraping_rules r
            LEFT JOIN funding_opportunities f ON r.id = f.source_rule_id
            WHERE r.rule_type = 'funding'
            GROUP BY r.name
            ORDER BY count DESC;
        `;

        const [categoryRes, regionRes, sourceRes] = await Promise.all([
            db.query(categoryQuery),
            db.query(regionQuery),
            db.query(sourceQuery)
        ]);

        res.json({
            categoryCounts: categoryRes.rows,
            regionCounts: regionRes.rows,
            sourceCounts: sourceRes.rows
        });
    } catch (err) {
        console.error('Error fetching funding stats:', err.message);
        res.status(500).send('Server error');
    }
};
