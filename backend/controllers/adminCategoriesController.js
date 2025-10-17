// backend/controllers/adminCategoriesController.js

const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// GET all categories
exports.getAllCategories = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, name_lang, name_lang_en, description, category_type FROM categories ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching categories:', err.message);
        res.status(500).send('Server error');
    }
};

// NEUE FUNKTION: Holt nur die Kategorien vom Typ 'industry'
exports.getAllIndustries = async (req, res) => {
    try {
        const result = await db.query("SELECT id, name FROM categories WHERE category_type = 'industry' ORDER BY name ASC");
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching industries:', err.message);
        res.status(500).send('Server error');
    }
};

// GET a single category by ID
exports.getCategoryById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        // KORREKTUR: Wählt die neuen Spalten aus
        const result = await db.query('SELECT id, name, name_lang, name_lang_en, description FROM categories WHERE id = $1', [id]);
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
