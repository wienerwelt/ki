// backend/routes/adminTagsRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const {
    getAllTags,
    createTag,
    updateTag,
    deleteTag
} = require('../controllers/adminTagsController');

// Multer Setup (Bild im RAM behalten für Sharp)
const upload = multer({ storage: multer.memoryStorage() });

// Alle Routen sind durch adminAuth geschützt
router.use(adminAuth);

// GET /api/admin/tags - Alle Tags inkl. Verwendungszähler abrufen
router.get('/', getAllTags);

// POST /api/admin/tags - Neuen Tag erstellen (inkl. Logo Upload)
router.post('/', upload.single('logo'), createTag);

// PUT /api/admin/tags/:id - Einen Tag aktualisieren (inkl. Logo Upload)
router.put('/:id', upload.single('logo'), updateTag);

// DELETE /api/admin/tags/:id - Einen Tag löschen
router.delete('/:id', deleteTag);

module.exports = router;