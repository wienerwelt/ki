// backend/controllers/adminScrapedContentController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// Holt alle Inhalte und fügt die zugehörigen Tag-Namen als Array hinzu
exports.getAllScrapedContent = async (req, res) => {
    const { source_identifier } = req.query;
    try {
        const query = `
            SELECT 
                sc.id, sc.source_identifier, sr.name as rule_name, sc.title, sc.original_url, sc.category,
                sc.published_date, sc.event_date, sc.region, sc.scraped_at, sc.relevance_score,
                'content' as data_type,
                (SELECT array_agg(t.name) FROM tags t JOIN scraped_content_tags sct ON t.id = sct.tag_id WHERE sct.scraped_content_id = sc.id) as tags
            FROM scraped_content sc
            LEFT JOIN scraping_rules sr ON sc.source_identifier = sr.source_identifier

            UNION ALL

            SELECT 
                ti.id, ti.source_identifier, sr.name as rule_name, ti.title, ti.link as original_url,
                ti.type as category, ti.published_at as published_date, null as event_date,
                ti.region, ti.published_at as scraped_at, 0 as relevance_score, 'traffic' as data_type,
                (SELECT array_agg(t.name) FROM tags t JOIN traffic_incidents_tags tit ON t.id = tit.tag_id WHERE tit.traffic_incident_id = ti.id) as tags
            FROM traffic_incidents ti
            LEFT JOIN scraping_rules sr ON ti.source_identifier = sr.source_identifier
        `;

        let finalQuery = `SELECT * FROM (${query}) AS combined_data`;
        const queryParams = [];
        if (source_identifier) {
            finalQuery += ` WHERE combined_data.source_identifier = $1`;
            queryParams.push(source_identifier);
        }
        finalQuery += ` ORDER BY combined_data.scraped_at DESC`;

        const result = await db.query(finalQuery, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all scraped content:', err.message);
        res.status(500).send('Server error');
    }
};

// GET a single scraped content entry by ID
exports.getScrapedContentById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Scraped Content ID format.' });

    try {
        const result = await db.query(
            `SELECT id, source_identifier, original_url, title, summary, full_text, published_date, event_date, category, tags, relevance_score, region, scraped_at, created_at, updated_at
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

// CREATE new scraped content entry
exports.createScrapedContent = async (req, res) => {
    const { source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, tags: tagIds, relevance_score, region } = req.body;
    if (!source_identifier || !original_url || !title) {
        return res.status(400).json({ message: 'Source identifier, original URL, and title are required.' });
    }
    
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const newContentId = uuidv4();

        const newEntry = await client.query(
            `INSERT INTO scraped_content (id, source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, relevance_score, region)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [newContentId, source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, relevance_score, region]
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

// Aktualisiert einen Inhalt und seine Tag-Verknüpfungen in einer Transaktion
exports.updateScrapedContent = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    
    const { title, summary, category_id, tags: tagIds, region, relevance_score } = req.body;

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const updatedContent = await client.query(
            `UPDATE scraped_content SET 
                title = $1, summary = $2, category_id = $3, region = $4, relevance_score = $5, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $6 RETURNING *`,
            [title, summary, category_id, region, relevance_score, id]
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

// Löscht einen Eintrag aus der korrekten Tabelle basierend auf dem Typ
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