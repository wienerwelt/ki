// backend/controllers/adminWidgetTypeController.js
const db = require('../config/db');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// GET all widget types with installation count
exports.getAllWidgetTypes = async (req, res) => {
    try {
        // KORREKTUR: Der Tabellenname wurde von 'dashboard_configs' auf 'dashboard_configurations' geändert.
        const query = `
            SELECT
                wt.*,
                COALESCE(counts.install_count, 0)::integer AS install_count
            FROM
                widget_types wt
            LEFT JOIN (
                SELECT
                    (widget->>'type') AS type_key,
                    COUNT(*) AS install_count
                FROM
                    dashboard_configurations,
                    jsonb_array_elements(config->'widgets') AS widget
                WHERE
                    jsonb_typeof(config->'widgets') = 'array' AND (widget->>'type') IS NOT NULL
                GROUP BY
                    type_key
            ) AS counts ON wt.type_key = counts.type_key
            ORDER BY
                wt.name ASC;
        `;
        const result = await db.query(query);
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

// Diese Funktion baut die UPDATE-Anweisung dynamisch auf.
exports.updateWidgetType = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) {
        return res.status(400).json({ message: 'Invalid Widget Type ID format.' });
    }

    try {
        const currentWtResult = await db.query('SELECT * FROM widget_types WHERE id = $1', [id]);
        if (currentWtResult.rows.length === 0) {
            return res.status(404).json({ message: 'Widget Type not found.' });
        }

        const fieldsToUpdate = req.body;
        const updateEntries = Object.entries(fieldsToUpdate).filter(([, value]) => value !== undefined);

        if (updateEntries.length === 0) {
            return res.status(400).json({ message: 'No fields to update provided.' });
        }

        const setClauses = updateEntries.map(([key], index) => `${key} = $${index + 1}`);
        const values = updateEntries.map(([, value]) => value);
        
        const query = `
            UPDATE widget_types 
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $${values.length + 1} 
            RETURNING *
        `;
        values.push(id);

        const updatedWt = await db.query(query, values);
        res.json(updatedWt.rows[0]);

    } catch (err) {
        console.error('Error updating widget type:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'A Widget Type with this name or type_key already exists.' });
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
