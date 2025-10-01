// backend/controllers/adminAIContentController.js
const db = require('../config/db');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// Holt alle KI-Inhalte und verknüpft sie mit Regel- und Kategorie-Namen
exports.getAllAIContent = async (req, res) => {
    // NEU: Parameter für Filter und Paginierung auslesen
    const { search, region, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    try {
        const queryParams = [];
        let paramIndex = 1;
        let whereClauses = [];

        // NEU: Filter-Logik
        if (search) {
            whereClauses.push(`(agc.title ILIKE $${paramIndex} OR cat.name ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        if (region && region !== 'all') {
            whereClauses.push(`agc.region = $${paramIndex++}`);
            queryParams.push(region);
        }
        
        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Zähl-Query für die Paginierung
        const totalQuery = `SELECT COUNT(*) FROM ai_generated_content agc LEFT JOIN categories cat ON agc.category_id = cat.id ${whereString}`;
        const totalResult = await db.query(totalQuery, queryParams);
        const totalItems = parseInt(totalResult.rows[0].count, 10);

        // Daten-Query mit Paginierung
        queryParams.push(limit, offset);
        const dataQuery = `
            SELECT 
                agc.id, agc.title, agc.generated_output, agc.output_format, agc.region, agc.created_at,
                apr.name as rule_name,
                cat.name as category_name, cat.id as category_id,
                (SELECT array_agg(t.name) FROM tags t JOIN ai_generated_content_tags aict ON t.id = aict.tag_id WHERE aict.ai_content_id = agc.id) as tags
            FROM ai_generated_content agc
            LEFT JOIN ai_prompt_rules apr ON agc.ai_prompt_rule_id = apr.id
            LEFT JOIN categories cat ON agc.category_id = cat.id
            ${whereString}
            ORDER BY agc.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        
        const result = await db.query(dataQuery, queryParams);
        
        res.json({
            data: result.rows,
            totalItems: totalItems
        });

    } catch (err) {
        console.error('Error fetching all AI content:', err.message);
        res.status(500).send('Server error');
    }
};

exports.updateAIContent = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    // KORREKTUR: 'region' wird jetzt aus dem Body erwartet
    const { title, generated_output, category_id, tags: tagIds, region } = req.body;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // KORREKTUR: Die UPDATE-Anweisung enthält jetzt auch die 'region'
        const updatedContent = await client.query(
            `UPDATE ai_generated_content 
             SET title = $1, generated_output = $2, category_id = $3, region = $4, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $5 RETURNING *`,
            [title, generated_output, category_id, region, id]
        );
        if (updatedContent.rows.length === 0) throw new Error('AI Content not found.');

        // Tag-Verarbeitung bleibt unverändert
        await client.query('DELETE FROM ai_generated_content_tags WHERE ai_content_id = $1', [id]);
        if (tagIds && tagIds.length > 0) {
            for (const tagId of tagIds) {
                await client.query(
                    'INSERT INTO ai_generated_content_tags (ai_content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [id, tagId]
                );
            }
        }

        await client.query('COMMIT');
        res.json(updatedContent.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating AI content:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// Löscht einen KI-Inhalt
exports.deleteAIContent = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const result = await db.query('DELETE FROM ai_generated_content WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'AI Content not found.' });
        res.json({ message: 'AI Content deleted successfully' });
    } catch (err) {
        console.error('Error deleting AI content:', err.message);
        res.status(500).send('Server error');
    }
};


exports.deleteMultipleAIContent = async (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Eine Liste von IDs ist erforderlich.' });
    }

    try {
        const result = await db.query(
            'DELETE FROM ai_generated_content WHERE id = ANY($1::uuid[])',
            [ids]
        );
        
        res.status(200).json({ 
            message: `${result.rowCount} KI-Inhalt(e) erfolgreich gelöscht.` 
        });
    } catch (err) {
        console.error('Fehler beim Löschen von KI-Inhalten:', err.message);
        res.status(500).send('Serverfehler beim Löschen der Inhalte.');
    }
};