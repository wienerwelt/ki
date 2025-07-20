// backend/routes/adminSourcesRoutes.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
    getAllSourcesAdmin,
    getSourceDetailsAdmin,
    updateSourceStatus,
    deleteSource,
    getSourceReports
} = require('../controllers/adminSourcesController');

// Alle Routen hier sind durch adminAuth geschützt
router.use(adminAuth);

// GET /api/admin/sources - Alle Quellen abrufen (mit Filtern)
router.get('/', getAllSourcesAdmin);

// GET /api/admin/sources/reports - Alle Meldungen abrufen
router.get('/reports', getSourceReports);

// GET /api/admin/sources/:id - Details einer Quelle abrufen
router.get('/:id', getSourceDetailsAdmin);

// PUT /api/admin/sources/:id/status - Status einer Quelle ändern (genehmigen/ablehnen)
router.put('/:id/status', updateSourceStatus);

// DELETE /api/admin/sources/:id - Eine Quelle löschen
router.delete('/:id', deleteSource);

module.exports = router;