// backend/routes/adminSourcesRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const {
    getAllSourcesAdmin,
    getSourceDetailsAdmin,
    updateSourceStatus,
    updateSource, 
    deleteSource,
    getSourceReports,
    adminCreateSource // NEU: Importiert!
} = require('../controllers/adminSourcesController');

const upload = multer({ storage: multer.memoryStorage() });

// Alle Routen hier sind durch adminAuth geschützt
router.use(adminAuth);

router.get('/', getAllSourcesAdmin);

// KORRIGIERT: auth/admin entfernt, Multer-Upload für das Logo hinzugefügt, direkter Funktionsaufruf
router.post('/', upload.single('logo'), adminCreateSource);

router.get('/reports', getSourceReports);
router.get('/:id', getSourceDetailsAdmin);
router.put('/:id/status', updateSourceStatus);

// Route zum Bearbeiten der Quelle inkl. Logo
router.put('/:id', upload.single('logo'), updateSource);

router.delete('/:id', deleteSource);

module.exports = router;