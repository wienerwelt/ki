// backend/controllers/adminScrapedContentController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

exports.getAllScrapedContent = async (req, res) => {
    // 1. Der neue 'region'-Parameter wird aus der Anfrage ausgelesen
    const { source_identifier, startDate, endDate, region, limit = 50, offset = 0 } = req.query;
    try {
        const baseQuery = `
            SELECT 
                sc.id, sc.source_identifier, sr.name as rule_name, sc.title, sc.original_url, sc.category,
                sc.summary, sc.published_date, sc.event_date, sc.region, sc.scraped_at, sc.relevance_score,
                sc.thumbnail_url, 'content' as data_type,
                (SELECT array_agg(t.name) FROM tags t JOIN scraped_content_tags sct ON t.id = sct.tag_id WHERE sct.scraped_content_id = sc.id) as tags
            FROM scraped_content sc
            LEFT JOIN scraping_rules sr ON sc.source_identifier = sr.source_identifier
            UNION ALL
            SELECT 
                ti.id, ti.source_identifier, sr.name as rule_name, ti.title, ti.link as original_url,
                ti.type as category, null as summary, ti.published_at as published_date, null as event_date,
                ti.region, ti.published_at as scraped_at, 0 as relevance_score,
                null as thumbnail_url, 'traffic' as data_type,
                (SELECT array_agg(t.name) FROM tags t JOIN traffic_incidents_tags tit ON t.id = tit.tag_id WHERE tit.traffic_incident_id = ti.id) as tags
            FROM traffic_incidents ti
            LEFT JOIN scraping_rules sr ON ti.source_identifier = sr.source_identifier
        `;

        const queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        if (source_identifier) {
            whereClauses.push(`combined_data.source_identifier = $${paramIndex++}`);
            queryParams.push(source_identifier);
        }
        if (startDate) {
            whereClauses.push(`combined_data.published_date >= $${paramIndex++}`);
            queryParams.push(startDate);
        }
        if (endDate) {
            const nextDay = new Date(endDate);
            nextDay.setDate(nextDay.getDate() + 1);
            whereClauses.push(`combined_data.published_date < $${paramIndex++}`);
            queryParams.push(nextDay.toISOString().split('T')[0]);
        }
        // 2. Die WHERE-Klausel wird dynamisch um den Regionsfilter erweitert
        if (region) {
            whereClauses.push(`combined_data.region = $${paramIndex++}`);
            queryParams.push(region);
        }

        let countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) AS combined_data`;
        if (whereClauses.length > 0) {
            countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        const totalResult = await db.query(countQuery, queryParams);
        const totalCount = parseInt(totalResult.rows[0].total, 10);

        let finalQuery = `SELECT * FROM (${baseQuery}) AS combined_data`;
        if (whereClauses.length > 0) {
            finalQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        finalQuery += ` ORDER BY combined_data.scraped_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(parseInt(limit, 10));
        queryParams.push(parseInt(offset, 10));

        const result = await db.query(finalQuery, queryParams);
        
        res.json({
            data: result.rows,
            total: totalCount
        });
    } catch (err) {
        console.error('Error fetching all scraped content:', err.message);
        res.status(500).send('Server error');
    }
};


exports.getScrapedContentById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Scraped Content ID format.' });

    try {
        const result = await db.query(
            `SELECT id, source_identifier, original_url, title, summary, full_text, published_date, event_date, category, tags, relevance_score, region, scraped_at, created_at, updated_at, thumbnail_url
             FROM scraped_content
             WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Scraped Content not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching scraped content by ID:', err.message);
        res.status(500).send('Server error');
    }
};

exports.createScrapedContent = async (req, res) => {
    const { source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, tags: tagIds, relevance_score, region, thumbnail_url } = req.body;
    if (!source_identifier || !original_url || !title) {
        return res.status(400).json({ message: 'Source identifier, original URL, and title are required.' });
    }
    
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const newContentId = uuidv4();

        const newEntry = await client.query(
            `INSERT INTO scraped_content (id, source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, relevance_score, region, thumbnail_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [newContentId, source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, relevance_score, region, thumbnail_url]
        );

        if (tagIds && tagIds.length > 0) {
            for (const tagId of tagIds) {
                await client.query(
                    'INSERT INTO scraped_content_tags (scraped_content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [newContentId, tagId]
                );
            }
        }
        await client.query('COMMIT');
        res.status(201).json(newEntry.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating scraped content:', err.message);
        if (err.code === '23505') { return res.status(409).json({ message: 'Content with this URL already exists.' }); }
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

exports.updateScrapedEvent = async (req, res) => {
    // This function remains unchanged as it handles specific fields for events
    const { id } = req.params;
    const { title, event_date, original_url, region, summary } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Ein Titel ist erforderlich.' });
    }

    try {
        const { rows } = await db.query(
            `UPDATE scraped_content
             SET 
                title = $1, 
                event_date = $2, 
                original_url = $3,
                region = $4,
                summary = $5,
                updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [title, event_date || null, original_url || null, region || null, summary || null, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Fehler beim Aktualisieren des Scraped Events:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.updateScrapedContent = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    
    const { title, summary, category_id, tags: tagIds, region, relevance_score, thumbnail_url } = req.body; // <-- ADDED thumbnail_url

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const updatedContent = await client.query(
            `UPDATE scraped_content SET 
                title = $1, summary = $2, category_id = $3, region = $4, relevance_score = $5, thumbnail_url = $6, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $7 RETURNING *`, // <-- MODIFIED
            [title, summary, category_id, region, relevance_score, thumbnail_url, id] // <-- MODIFIED
        );
        if (updatedContent.rows.length === 0) throw new Error('Content not found.');

        await client.query('DELETE FROM scraped_content_tags WHERE scraped_content_id = $1', [id]);

        if (tagIds && tagIds.length > 0) {
            for (const tagId of tagIds) {
                await client.query(
                    'INSERT INTO scraped_content_tags (scraped_content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [id, tagId]
                );
            }
        }
        await client.query('COMMIT');
        res.json(updatedContent.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating scraped content:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// ... (rest of the file remains unchanged)
exports.deleteScrapedContent = async (req, res) => {
    const { id } = req.params;
    const { dataType } = req.query;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const tableName = dataType === 'traffic' ? 'traffic_incidents' : 'scraped_content';
        const query = `DELETE FROM ${tableName} WHERE id = $1 RETURNING id`;
        const result = await db.query(query, [id]);

        if (result.rows.length === 0) return res.status(404).json({ message: 'Content not found.' });
        res.json({ message: 'Content deleted successfully', id: result.rows[0].id });
    } catch (err) {
        console.error('Error deleting content:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getAllScrapedEventsForAdmin = async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT 
                sc.id, 
                sc.title, 
                sc.event_date, 
                sc.original_url, 
                sc.source_identifier, 
                sc.category_id, 
                c.name as category_name,
                sc.region,
                sc.summary
            FROM scraped_content sc
            LEFT JOIN categories c ON sc.category_id = c.id
            WHERE sc.category LIKE '%_events'
            ORDER BY sc.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Laden der Scraped Events für Admin:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.createManualEvent = async (req, res) => {
    const { title, event_date, region, summary, original_url } = req.body;

    if (!title || !event_date) {
        return res.status(400).json({ message: 'Titel und Event-Datum sind erforderlich.' });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO scraped_content (id, title, event_date, region, summary, original_url, category, source_identifier)
             VALUES ($1, $2, $3, $4, $5, $6, 'industry_events', 'manual_entry')
             RETURNING *`,
            [uuidv4(), title, event_date, region || null, summary || null, original_url || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Fehler beim Erstellen des manuellen Events:', err.message);
        res.status(500).send('Serverfehler');
    }
};

// GEÄNDERT: Holt alle Regionen inkl. ID für Dropdowns
exports.getAllRegions = async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id, name, code FROM regions ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Laden der Regionen:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.triggerDeepDive = async (req, res) => {
    const { id: contentId } = req.params;

    try {
        const contentRes = await db.query(
            'SELECT original_url, region FROM scraped_content WHERE id = $1',
            [contentId]
        );
        if (contentRes.rows.length === 0) {
            return res.status(404).json({ message: 'Inhalt nicht gefunden.' });
        }
        const { original_url, region } = contentRes.rows[0];

        if (!original_url) {
            return res.status(400).json({ message: 'Dieser Inhalt hat keine verknüpfte URL für einen Deep Dive.' });
        }

        await fundingQueue.add('extract-funding-details', {
            sourceRuleId: null, 
            articleUrl: original_url,
            region: region,
        });

        res.status(202).json({ message: 'KI Deep Dive wurde erfolgreich zur Analyse in die Warteschlange gestellt.' });

    } catch (err) {
        console.error(`Error triggering deep dive for content ${contentId}:`, err.message);
        res.status(500).send('Serverfehler');
    }
};