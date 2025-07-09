// backend/routes/adminTagsRoutes.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
    getAllTags,
    createTag,
    updateTag,
    deleteTag
} = require('../controllers/adminTagsController');

// Alle Routen sind durch adminAuth geschützt
router.use(adminAuth);

// GET /api/admin/tags - Alle Tags inkl. Verwendungszähler abrufen
router.get('/', getAllTags);

// POST /api/admin/tags - Neuen Tag erstellen
router.post('/', createTag);

// PUT /api/admin/tags/:id - Einen Tag aktualisieren
router.put('/:id', updateTag);

// DELETE /api/admin/tags/:id - Einen Tag löschen
router.delete('/:id', deleteTag);

module.exports = router;