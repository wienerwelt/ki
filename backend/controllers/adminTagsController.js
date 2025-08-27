// backend/controllers/adminTagsController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

exports.getAllTags = async (req, res) => {
    try {
        // KORREKTUR: JOIN mit der categories-Tabelle, um den Namen der Kategorie abzurufen
        const query = `
            SELECT 
                t.id, 
                t.name, 
                t.description,
                t.category_id,
                c.name AS category_name, -- Name der verknüpften Kategorie
                (
                    COALESCE((SELECT COUNT(*) FROM scraped_content_tags sct WHERE sct.tag_id = t.id), 0) +
                    COALESCE((SELECT COUNT(*) FROM ai_generated_content_tags aict WHERE aict.tag_id = t.id), 0) +
                    COALESCE((SELECT COUNT(*) FROM traffic_incidents_tags tit WHERE tit.tag_id = t.id), 0)
                )::INTEGER AS usage_count
            FROM 
                tags t
            LEFT JOIN 
                categories c ON t.category_id = c.id -- LEFT JOIN, damit auch Tags ohne Kategorie angezeigt werden
            GROUP BY 
                t.id, t.name, t.description, c.name
            ORDER BY 
                t.name ASC;
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching tags with usage count:', err.message);
        res.status(500).send('Server error');
    }
};

exports.createTag = async (req, res) => {
    // KORREKTUR: category_id wird jetzt akzeptiert
    const { name, description, category_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    try {
        const newTag = await db.query(
            'INSERT INTO tags (id, name, description, category_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [uuidv4(), name, description || null, category_id || null]
        );
        res.status(201).json(newTag.rows[0]);
    } catch (err) {
        console.error('Error creating tag:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'A tag with this name already exists.' });
        res.status(500).send('Server error');
    }
};

exports.updateTag = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    // KORREKTUR: category_id wird jetzt akzeptiert
    const { name, description, category_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    try {
        const updatedTag = await db.query(
            'UPDATE tags SET name = $1, description = $2, category_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
            [name, description || null, category_id || null, id]
        );
        if (updatedTag.rows.length === 0) return res.status(404).json({ message: 'Tag not found.' });
        res.json(updatedTag.rows[0]);
    } catch (err) {
        console.error('Error updating tag:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'A tag with this name already exists.' });
        res.status(500).send('Server error');
    }
};

// deleteTag bleibt unverändert
exports.deleteTag = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const deletedTag = await db.query(
            'DELETE FROM tags WHERE id = $1 RETURNING *',
            [id]
        );
        if (deletedTag.rows.length === 0) return res.status(404).json({ message: 'Tag not found.' });
        res.json(deletedTag.rows[0]);
    } catch (err) {
        console.error('Error deleting tag:', err.message);
        res.status(500).send('Server error');
    }
};
