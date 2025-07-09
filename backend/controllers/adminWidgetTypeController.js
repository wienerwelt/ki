// backend/controllers/adminWidgetTypeController.js
const db = require('../config/db');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// GET all widget types
exports.getAllWidgetTypes = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM widget_types ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all widget types:', err.message);
        res.status(500).send('Server error');
    }
};

// GET a single widget type by ID
exports.getWidgetTypeById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Widget Type ID format.' });

    try {
        const result = await db.query('SELECT * FROM widget_types WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Widget Type not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching widget type by ID:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE new widget type
exports.createWidgetType = async (req, res) => {
    const { name, type_key, description, icon_name, is_removable = true, is_resizable = true, is_draggable = true, default_width = 4, default_height = 6, default_min_width = 3, default_min_height = 4, allowed_roles = [], config = null, component_key = null } = req.body;

    if (!name || !type_key) {
        return res.status(400).json({ message: 'Name and type_key are required.' });
    }

    try {
        const newWt = await db.query(
            `INSERT INTO widget_types (name, type_key, description, icon_name, is_removable, is_resizable, is_draggable, default_width, default_height, default_min_width, default_min_height, allowed_roles, config, component_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [name, type_key, description, icon_name, is_removable, is_resizable, is_draggable, default_width, default_height, default_min_width, default_min_height, allowed_roles, config, component_key]
        );
        res.status(201).json(newWt.rows[0]);
    } catch (err) {
        console.error('Error creating widget type:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Widget Type with this name or type_key already exists.' });
        }
        res.status(500).send('Server error');
    }
};

// UPDATE existing widget type
exports.updateWidgetType = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Widget Type ID format.' });

    const { name, type_key, description, icon_name, is_removable, is_resizable, is_draggable, default_width, default_height, default_min_width, default_min_height, allowed_roles, config, component_key } = req.body;

    try {
        const currentWt = await db.query('SELECT * FROM widget_types WHERE id = $1', [id]);
        if (currentWt.rows.length === 0) {
            return res.status(404).json({ message: 'Widget Type not found.' });
        }

        const updatedWt = await db.query(
            `UPDATE widget_types SET
                name = $1, type_key = $2, description = $3, icon_name = $4,
                is_removable = $5, is_resizable = $6, is_draggable = $7,
                default_width = $8, default_height = $9, default_min_width = $10,
                default_min_height = $11, allowed_roles = $12, config = $13,
                component_key = $14, updated_at = CURRENT_TIMESTAMP
             WHERE id = $15 RETURNING *`,
            [name, type_key, description, icon_name, is_removable, is_resizable, is_draggable, default_width, default_height, default_min_width, default_min_height, allowed_roles, config, component_key, id]
        );
        res.json(updatedWt.rows[0]);
    } catch (err) {
        console.error('Error updating widget type:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Widget Type with this name or type_key already exists.' });
        }
        res.status(500).send('Server error');
    }
};

// DELETE a widget type
exports.deleteWidgetType = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Widget Type ID format.' });

    try {
        const result = await db.query('DELETE FROM widget_types WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Widget Type not found.' });
        }
        res.json({ message: 'Widget Type deleted successfully', id: result.rows[0].id });
    } catch (err) {
        console.error('Error deleting widget type:', err.message);
        res.status(500).send('Server error');
    }
};
