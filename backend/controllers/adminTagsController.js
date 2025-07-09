// backend/controllers/adminTagsController.js

const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// Holt alle Tags und zählt deren Verwendung über alle Inhaltstypen hinweg
exports.getAllTags = async (req, res) => {
    try {
        const query = `
            SELECT 
                t.id, 
                t.name, 
                t.description,
                (
                    COALESCE((SELECT COUNT(*) FROM scraped_content_tags sct WHERE sct.tag_id = t.id), 0) +
                    COALESCE((SELECT COUNT(*) FROM ai_generated_content_tags aict WHERE aict.tag_id = t.id), 0) +
                    COALESCE((SELECT COUNT(*) FROM traffic_incidents_tags tit WHERE tit.tag_id = t.id), 0)
                )::INTEGER AS usage_count
            FROM 
                tags t
            GROUP BY 
                t.id, t.name, t.description
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

// Erstellt einen neuen Tag
exports.createTag = async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    try {
        const newTag = await db.query(
            'INSERT INTO tags (id, name, description) VALUES ($1, $2, $3) RETURNING *',
            [uuidv4(), name, description || null]
        );
        res.status(201).json(newTag.rows[0]);
    } catch (err) {
        console.error('Error creating tag:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'A tag with this name already exists.' });
        res.status(500).send('Server error');
    }
};

// Aktualisiert einen bestehenden Tag
exports.updateTag = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    try {
        const updatedTag = await db.query(
            'UPDATE tags SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [name, description || null, id]
        );
        if (updatedTag.rows.length === 0) return res.status(404).json({ message: 'Tag not found.' });
        res.json(updatedTag.rows[0]);
    } catch (err) {
        console.error('Error updating tag:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'A tag with this name already exists.' });
        res.status(500).send('Server error');
    }
};

// Löscht einen Tag
exports.deleteTag = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        // Die ON DELETE CASCADE Regel in der DB löscht automatisch die Einträge in den Verbindungstabellen
        const result = await db.query('DELETE FROM tags WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Tag not found.' });
        res.status(200).json({ message: 'Tag deleted successfully' });
    } catch (err) {
        console.error('Error deleting tag:', err.message);
        res.status(500).send('Server error');
    }
};