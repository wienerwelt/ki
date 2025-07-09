// backend/routes/adminCategoriesRoutes.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategoryById
} = require('../controllers/adminCategoriesController');

// Alle Routen sind durch adminAuth geschützt
router.use(adminAuth);

// GET /api/admin/categories - Alle Kategorien abrufen
router.get('/', getAllCategories);

// POST /api/admin/categories - Neue Kategorie erstellen
router.post('/', createCategory);

// GET /api/admin/categories/:id - Eine einzelne Kategorie abrufen
router.get('/:id', getCategoryById);

// PUT /api/admin/categories/:id - Eine Kategorie aktualisieren
router.put('/:id', updateCategory);

// DELETE /api/admin/categories/:id - Eine Kategorie löschen
router.delete('/:id', deleteCategory);

module.exports = router;