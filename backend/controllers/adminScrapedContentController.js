// backend/controllers/adminScrapedContentController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("../config/s3Client.js");

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

exports.getAllScrapedContent = async (req, res) => {
    const { source_identifier, startDate, endDate, region, category_id, limit = 50, offset = 0 } = req.query;
    
    try {
        // FIX: Alle Spalten werden strikt auf denselben Datentyp (::text, ::timestamp, ::numeric) gecastet, 
        // um den "UNION ALL" Crash in PostgreSQL zu verhindern!
        const baseQuery = `
            SELECT 
                sc.id::text, 
                sc.source_identifier::text, 
                sr.name::text as rule_name, 
                sc.title::text, 
                sc.original_url::text, 
                sc.category::text,
                sc.category_id::text,
                sc.summary::text, 
                sc.published_date, 
                sc.event_date, 
                sc.region::text, 
                sc.scraped_at, 
                sc.relevance_score::numeric,
                sc.created_at,
                sc.thumbnail_url::text, 
                'content'::text as data_type,
                (SELECT array_agg(t.name::text) FROM tags t JOIN scraped_content_tags sct ON t.id = sct.tag_id WHERE sct.scraped_content_id = sc.id) as tags
            FROM scraped_content sc
            LEFT JOIN scraping_rules sr ON sc.source_identifier = sr.source_identifier
            
            UNION ALL
            
            SELECT 
                ti.id::text, 
                ti.source_identifier::text, 
                sr.name::text as rule_name, 
                ti.title::text, 
                ti.link::text as original_url,
                ti.type::text as category, 
                NULL::text as category_id,
                NULL::text as summary, 
                ti.published_at as published_date, 
                NULL::timestamp as event_date,
                ti.region::text, 
                ti.published_at as scraped_at, 
                0::numeric as relevance_score,
                ti.published_at as created_at, -- FIX: Verhindert Absturz, falls ti.created_at nicht existiert
                NULL::text as thumbnail_url, 
                'traffic'::text as data_type,
                (SELECT array_agg(t.name::text) FROM tags t JOIN traffic_incidents_tags tit ON t.id = tit.tag_id WHERE tit.traffic_incident_id = ti.id) as tags
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
        if (region) {
            whereClauses.push(`combined_data.region = $${paramIndex++}`);
            queryParams.push(region);
        }
        if (category_id) {
            whereClauses.push(`combined_data.category_id = $${paramIndex++}`);
            queryParams.push(category_id);
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
    // 'category' aus req.body mit auslesen!
    const { source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, category, tags: tagIds, relevance_score, region, thumbnail_url } = req.body;
    
    if (!source_identifier || !original_url || !title) {
        return res.status(400).json({ message: 'Source identifier, original URL, and title are required.' });
    }
    
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        let finalCategoryId = category_id || null;
        let finalCategoryText = category || null;

        // 1. Synchronisation: Text -> ID (Für den Python-Scraper)
        if (finalCategoryText && !finalCategoryId) {
            const catRes = await client.query('SELECT id FROM categories WHERE name = $1 LIMIT 1', [finalCategoryText]);
            if (catRes.rows.length > 0) {
                finalCategoryId = catRes.rows[0].id;
            }
        }
        // 2. Synchronisation: ID -> Text (Für das Admin-Frontend)
        else if (finalCategoryId && !finalCategoryText) {
            const catRes = await client.query('SELECT name FROM categories WHERE id = $1 LIMIT 1', [finalCategoryId]);
            if (catRes.rows.length > 0) {
                finalCategoryText = catRes.rows[0].name;
            }
        }

        const newContentId = uuidv4();

        const newEntry = await client.query(
            `INSERT INTO scraped_content (id, source_identifier, original_url, title, summary, full_text, published_date, event_date, category_id, category, relevance_score, region, thumbnail_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [newContentId, source_identifier, original_url, title, summary, full_text, published_date, event_date, finalCategoryId, finalCategoryText, relevance_score, region, thumbnail_url]
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
    const { id } = req.params;
    const { title, event_date, original_url, region, summary, thumbnail_url, businessPartnerId, category_id, category, source_identifier } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Ein Titel ist erforderlich.' });
    }

    let finalUrl = null;
    if (original_url && original_url.trim() !== '' && original_url !== 'https://') {
        finalUrl = original_url.trim();
    }

    const finalSourceIdentifier = source_identifier || (businessPartnerId ? `${businessPartnerId}_events` : 'global_events');

    let finalCategoryId = category_id || null;
    let finalCategoryText = category || 'events';

    try {
        if (finalCategoryId && (!category || category === 'events')) {
            const catRes = await db.query('SELECT name FROM categories WHERE id = $1 LIMIT 1', [finalCategoryId]);
            if (catRes.rows.length > 0) finalCategoryText = catRes.rows[0].name;
        } else if (finalCategoryText && !finalCategoryId) {
            const catRes = await db.query('SELECT id FROM categories WHERE name = $1 LIMIT 1', [finalCategoryText]);
            if (catRes.rows.length > 0) finalCategoryId = catRes.rows[0].id;
        }

        const { rows } = await db.query(
            `UPDATE scraped_content
             SET 
                title = $1, 
                event_date = $2, 
                original_url = $3,
                region = $4,
                summary = $5,
                thumbnail_url = $6,
                source_identifier = $7,
                category_id = $8,
                category = $9,
                updated_at = NOW()
             WHERE id = $10
             RETURNING *`,
            [
                title, 
                event_date || null, 
                finalUrl, 
                region || null, 
                summary || null, 
                thumbnail_url || null,
                finalSourceIdentifier, 
                finalCategoryId, 
                finalCategoryText,
                id
            ]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Fehler beim Aktualisieren des Scraped Events:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Ein anderes Event nutzt diese URL bereits.' });
       }
        res.status(500).send('Serverfehler');
    }
};


exports.updateScrapedContent = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    
    // NEU: published_date, event_date und created_at auslesen
    const { title, summary, category_id, category, tags: tagIds, region, relevance_score, thumbnail_url, published_date, event_date, created_at } = req.body;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        let finalCategoryId = category_id || null;
        let finalCategoryText = category || null;

        if (finalCategoryId && !finalCategoryText) {
            const catRes = await client.query('SELECT name FROM categories WHERE id = $1 LIMIT 1', [finalCategoryId]);
            if (catRes.rows.length > 0) finalCategoryText = catRes.rows[0].name;
        } else if (finalCategoryText && !finalCategoryId) {
            const catRes = await client.query('SELECT id FROM categories WHERE name = $1 LIMIT 1', [finalCategoryText]);
            if (catRes.rows.length > 0) finalCategoryId = catRes.rows[0].id;
        }
        
        // NEU: Query um die Datumsfelder und entsprechenden Variablen erweitert
        const updatedContent = await client.query(
            `UPDATE scraped_content SET 
                title = $1, 
                summary = $2, 
                category_id = $3, 
                category = $4, 
                region = $5, 
                relevance_score = $6, 
                thumbnail_url = $7, 
                published_date = $8,
                event_date = $9,
                created_at = COALESCE($10, created_at),
                updated_at = CURRENT_TIMESTAMP 
             WHERE id = $11 RETURNING *`,
            [title, summary, finalCategoryId, finalCategoryText, region, relevance_score, thumbnail_url, published_date || null, event_date || null, created_at || null, id]
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
                sc.summary,
                sc.thumbnail_url
            FROM scraped_content sc
            LEFT JOIN categories c ON sc.category_id = c.id
            WHERE sc.category = 'events' OR sc.category LIKE '%_events'
            ORDER BY sc.event_date DESC NULLS LAST, sc.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Laden der Scraped Events für Admin:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.createManualEvent = async (req, res) => {
    const { title, event_date, region, summary, original_url, category, thumbnail_url, businessPartnerId, category_id, source_identifier } = req.body;

    let finalUrl = null;
    if (original_url && original_url.trim() !== '' && original_url !== 'https://') {
        finalUrl = original_url.trim();
    }

    const finalSourceIdentifier = source_identifier || (businessPartnerId ? `${businessPartnerId}_events` : 'global_events');

    let finalCategoryId = category_id || null;
    let finalCategoryText = category || 'events';

    try {
        if (finalCategoryId && (!category || category === 'events')) {
            const catRes = await db.query('SELECT name FROM categories WHERE id = $1 LIMIT 1', [finalCategoryId]);
            if (catRes.rows.length > 0) finalCategoryText = catRes.rows[0].name;
        } else if (finalCategoryText && !finalCategoryId) {
            const catRes = await db.query('SELECT id FROM categories WHERE name = $1 LIMIT 1', [finalCategoryText]);
            if (catRes.rows.length > 0) finalCategoryId = catRes.rows[0].id;
        }

        const result = await db.query(
            `INSERT INTO scraped_content 
            (title, event_date, region, summary, original_url, category_id, category, source_identifier, thumbnail_url, published_date, scraped_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING *`,
            [
                title, 
                event_date || null, 
                region || null, 
                summary || null, 
                finalUrl, 
                finalCategoryId, 
                finalCategoryText,
                finalSourceIdentifier,
                thumbnail_url || null
            ]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Fehler beim Erstellen des manuellen Events:', err.message);
        if (err.code === '23505') {
             return res.status(409).json({ message: 'Ein Event mit dieser Ticket-URL existiert bereits.' });
        }
        res.status(500).json({ message: 'Serverfehler beim Speichern.' });
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

exports.downloadStatisticArchive = async (req, res) => {
    const { id } = req.params; // ID des economic_statistics Eintrags
    
    // Sicherheit: Nur Admins oder befugte Rollen dürfen die Rohdateien laden
    if (req.user?.role !== 'admin' && req.user?.role !== 'assistenz') {
        return res.status(403).json({ message: 'Keine Berechtigung zum Download von Systemdateien.' });
    }

    try {
        // 1. Pfad aus der Datenbank holen
        const result = await db.query(
            `SELECT archive_path FROM economic_statistics WHERE id = $1`, 
            [id]
        );

        if (result.rows.length === 0 || !result.rows[0].archive_path) {
            return res.status(404).json({ message: 'Keine Archivdatei für diesen Datensatz gefunden.' });
        }

        const archivePath = result.rows[0].archive_path;

        // 2. Temporäre S3 URL generieren (gültig für 60 Sekunden)
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: archivePath,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
        
        // 3. Dem Frontend die URL übergeben
        res.status(200).json({ url: signedUrl });

    } catch (error) {
        console.error('Fehler beim Generieren der S3 Download-URL:', error);
        res.status(500).json({ message: 'Interner Serverfehler beim Bereitstellen der Datei.' });
    }
};