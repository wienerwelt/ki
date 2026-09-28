// backend/controllers/adminCategoriesController.js

const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const toSoftwareCategorySlug = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

const parseSoftwareCategoryPayload = (body = {}) => {
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 150);
    const slug = toSoftwareCategorySlug(body.slug || name);
    const parsedSortOrder = Number.parseInt(body.sort_order, 10);
    const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0;

    if (!name) {
        const error = new Error('Bitte einen Namen angeben.');
        error.statusCode = 400;
        throw error;
    }
    if (!slug) {
        const error = new Error('Aus dem Namen konnte kein gültiger technischer Slug erzeugt werden.');
        error.statusCode = 400;
        throw error;
    }
    if (sortOrder < 0 || sortOrder > 100000) {
        const error = new Error('Die Sortierreihenfolge muss zwischen 0 und 100.000 liegen.');
        error.statusCode = 400;
        throw error;
    }

    return {
        name,
        slug,
        sortOrder,
        isActive: body.is_active !== false,
    };
};

// GET all categories
exports.getAllCategories = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                id, 
                name, 
                name AS category_name, 
                name_lang, 
                name_lang_en, 
                description, 
                category_type, 
                category_type AS category_typ 
            FROM categories 
            ORDER BY name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching categories:', err.message);
        res.status(500).send('Server error');
    }
};

// NEUE FUNKTION: Holt nur die Kategorien vom Typ 'industry'
exports.getAllIndustries = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                id, 
                name, 
                name AS category_name 
            FROM categories 
            WHERE category_type = 'industry' 
            ORDER BY name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching industries:', err.message);
        res.status(500).send('Server error');
    }
};

// Software-Kategorien bleiben fachlich von Content-/Branchenkategorien getrennt,
// werden aber über dieselbe zentrale Admin-Seite verwaltet.
exports.getSoftwareCategories = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                sc.id,
                sc.slug,
                sc.name,
                sc.sort_order,
                sc.is_active,
                sc.created_at,
                sc.updated_at,
                COUNT(DISTINCT stc.software_tool_id)::int AS usage_count
            FROM software_categories sc
            LEFT JOIN software_tool_categories stc ON stc.category_id = sc.id
            GROUP BY sc.id
            ORDER BY sc.is_active DESC, sc.sort_order, sc.name
        `);
        return res.json(result.rows);
    } catch (error) {
        console.error('Error fetching software categories:', error.message);
        return res.status(500).json({ message: 'Software-Kategorien konnten nicht geladen werden.' });
    }
};

exports.createSoftwareCategory = async (req, res) => {
    try {
        const payload = parseSoftwareCategoryPayload(req.body);
        const result = await db.query(`
            INSERT INTO software_categories (slug, name, sort_order, is_active)
            VALUES ($1, $2, $3, $4)
            RETURNING id, slug, name, sort_order, is_active, created_at, updated_at, 0::int AS usage_count
        `, [payload.slug, payload.name, payload.sortOrder, payload.isActive]);
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating software category:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Dieser technische Slug wird bereits verwendet.' });
        }
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : 'Software-Kategorie konnte nicht angelegt werden.',
        });
    }
};

exports.updateSoftwareCategory = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Ungültige Kategorie-ID.' });

    try {
        const payload = parseSoftwareCategoryPayload(req.body);
        const current = await db.query(`
            SELECT
                sc.slug,
                COUNT(stc.software_tool_id)::int AS usage_count
            FROM software_categories sc
            LEFT JOIN software_tool_categories stc ON stc.category_id = sc.id
            WHERE sc.id = $1
            GROUP BY sc.id
        `, [id]);
        if (current.rows.length === 0) {
            return res.status(404).json({ message: 'Software-Kategorie wurde nicht gefunden.' });
        }
        if (Number(current.rows[0].usage_count || 0) > 0 && current.rows[0].slug !== payload.slug) {
            return res.status(409).json({
                message: 'Der technische Slug kann nicht mehr geändert werden, weil die Kategorie bereits verwendet wird.',
            });
        }

        const result = await db.query(`
            UPDATE software_categories
            SET slug = $1,
                name = $2,
                sort_order = $3,
                is_active = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING id, slug, name, sort_order, is_active, created_at, updated_at,
                (SELECT COUNT(*)::int FROM software_tool_categories WHERE category_id = $5) AS usage_count
        `, [payload.slug, payload.name, payload.sortOrder, payload.isActive, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Software-Kategorie wurde nicht gefunden.' });
        }
        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating software category:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Dieser technische Slug wird bereits verwendet.' });
        }
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : 'Software-Kategorie konnte nicht gespeichert werden.',
        });
    }
};

exports.deleteSoftwareCategory = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Ungültige Kategorie-ID.' });

    try {
        const usage = await db.query(
            'SELECT COUNT(*)::int AS usage_count FROM software_tool_categories WHERE category_id = $1',
            [id]
        );
        const usageCount = Number(usage.rows[0]?.usage_count || 0);
        if (usageCount > 0) {
            return res.status(409).json({
                message: usageCount === 1
                    ? 'Diese Kategorie wird von einem Software-Eintrag verwendet. Bitte stattdessen deaktivieren.'
                    : `Diese Kategorie wird von ${usageCount} Software-Einträgen verwendet. Bitte stattdessen deaktivieren.`,
            });
        }

        const result = await db.query('DELETE FROM software_categories WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Software-Kategorie wurde nicht gefunden.' });
        }
        return res.json({ message: 'Software-Kategorie wurde gelöscht.' });
    } catch (error) {
        console.error('Error deleting software category:', error.message);
        return res.status(500).json({ message: 'Software-Kategorie konnte nicht gelöscht werden.' });
    }
};

// GET a single category by ID
exports.getCategoryById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const result = await db.query(`
            SELECT 
                id, 
                name, 
                name AS category_name, 
                name_lang, 
                name_lang_en, 
                description, 
                category_type, 
                category_type AS category_typ 
            FROM categories 
            WHERE id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Category not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching category by ID:', err.message);
        res.status(500).send('Server error');
    }
};

// CREATE a new category
exports.createCategory = async (req, res) => {
    const { name, name_lang, name_lang_en, description, category_type } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });

    try {
        const newCategory = await db.query(
            'INSERT INTO categories (id, name, name_lang, name_lang_en, description, category_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [uuidv4(), name, name_lang || null, name_lang_en || null, description || null, category_type || 'content']
        );
        res.status(201).json(newCategory.rows[0]);
    } catch (err) {
        console.error('Error creating category:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'A category with this name already exists.' });
        res.status(500).send('Server error');
    }
};

// UPDATE an existing category
exports.updateCategory = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    
    const { name, name_lang, name_lang_en, description, category_type } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });

    try {
        const updatedCategory = await db.query(
            'UPDATE categories SET name = $1, name_lang = $2, name_lang_en = $3, description = $4, category_type = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
            [name, name_lang || null, name_lang_en || null, description || null, category_type || 'content', id]
        );
        if (updatedCategory.rows.length === 0) return res.status(404).json({ message: 'Category not found.' });
        res.json(updatedCategory.rows[0]);
    } catch (err) {
        console.error('Error updating category:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'A category with this name already exists.' });
        res.status(500).send('Server error');
    }
};

// DELETE a category
exports.deleteCategory = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const result = await db.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Category not found.' });
        }
        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (err) {
        console.error('Error deleting category:', err.message);
        // Fallback für Foreign-Key-Constraint-Verletzung
        if (err.code === '23503') {
            return res.status(400).json({ message: 'Cannot delete category because it is still in use.' });
        }
        res.status(500).send('Server error');
    }
};
