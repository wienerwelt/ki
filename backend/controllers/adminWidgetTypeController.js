// backend/controllers/adminWidgetTypeController.js
const db = require('../config/db');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// GET all widget types - This function is fine
exports.getAllWidgetTypes = async (req, res) => {
    try {
        const query = `
            WITH widget_counts AS (
              SELECT
                (widget_element ->> 'type') AS widget_type_key,
                COUNT(DISTINCT dc.user_id) AS user_install_count,
                COUNT(DISTINCT u.business_partner_id) AS business_partner_install_count
              FROM
                dashboard_configurations dc
              JOIN
                users u ON dc.user_id = u.id,
              -- LATERAL JOIN ist die korrekte Methode, um JSON-Arrays zu entpacken
              LATERAL jsonb_array_elements(dc.config -> 'widgets') AS widget_element
              GROUP BY
                widget_type_key
            )
            SELECT
              wt.*,
              COALESCE(wc.user_install_count, 0)::INTEGER AS user_install_count,
              COALESCE(wc.business_partner_install_count, 0)::INTEGER AS business_partner_install_count
            FROM
              widget_types wt
            LEFT JOIN
              widget_counts wc ON wt.type_key = wc.widget_type_key
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

// CREATE new widget type - CORRECTED
exports.createWidgetType = async (req, res) => {
    // KORREKTUR: Wir holen die Rohdaten und wenden Standardwerte manuell an.
    const { 
        name, type_key, description, icon_name, is_removable, is_resizable, is_draggable, 
        default_width, default_height, default_min_width, default_min_height, 
        allowed_roles, config, component_key 
    } = req.body;

    if (!name || !type_key) {
        return res.status(400).json({ message: 'Name and type_key are required.' });
    }

    try {
        const newWt = await db.query(
            `INSERT INTO widget_types (name, type_key, description, icon_name, is_removable, is_resizable, is_draggable, default_width, default_height, default_min_width, default_min_height, allowed_roles, config, component_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [
                name,
                type_key,
                description || null,
                icon_name || null,
                is_removable ?? true,
                is_resizable ?? true,
                is_draggable ?? true,
                parseInt(default_width, 10) || 4,
                parseInt(default_height, 10) || 6,
                parseInt(default_min_width, 10) || 3,
                parseInt(default_min_height, 10) || 4,
                allowed_roles || [], // Stellt sicher, dass immer ein Array an die DB geht
                config || null,
                component_key || null
            ]
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

// UPDATE an existing widget type - CORRECTED
exports.updateWidgetType = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) {
        return res.status(400).json({ message: 'Invalid Widget Type ID format.' });
    }

    try {
        // KORREKTUR: Wir bauen die Query dynamisch, aber mit Typsicherheit.
        const fieldsToUpdate = req.body;
        
        // Konvertiere numerische Felder, falls sie als String kommen
        const numericFields = ['default_width', 'default_height', 'default_min_width', 'default_min_height'];
        numericFields.forEach(field => {
            if (fieldsToUpdate[field] !== undefined) {
                fieldsToUpdate[field] = parseInt(fieldsToUpdate[field], 10);
            }
        });
        
        // Stelle sicher, dass 'allowed_roles' ein Array ist, falls es 'null' ist
        if (fieldsToUpdate.allowed_roles === null) {
            fieldsToUpdate.allowed_roles = [];
        }

        const updateEntries = Object.entries(fieldsToUpdate).filter(([, value]) => value !== undefined);

        if (updateEntries.length === 0) {
            return res.status(400).json({ message: 'No fields to update provided.' });
        }

        const setClauses = updateEntries.map(([key], index) => `"${key}" = $${index + 1}`);
        const values = updateEntries.map(([, value]) => value);
        
        const query = `
            UPDATE widget_types 
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $${values.length + 1} 
            RETURNING *
        `;
        values.push(id);

        const updatedWt = await db.query(query, values);
        
        if (updatedWt.rows.length === 0) {
            return res.status(404).json({ message: 'Widget Type not found.' });
        }
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
