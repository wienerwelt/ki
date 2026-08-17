// backend/routes/adminLegalMonitorRoutes.js
const express = require('express');
const router = express.Router();
const tenantManagerAuth = require('../middleware/tenantManagerAuth');
const adminLegalMonitorController = require('../controllers/adminLegalMonitorController');

const multer = require('multer');
const os = require('os');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, os.tmpdir()); 
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const isPdf = file.mimetype === 'application/pdf' && /\.pdf$/i.test(String(file.originalname || ''));
        return isPdf ? cb(null, true) : cb(new Error('Nur PDF-Dateien sind erlaubt.'));
    },
});

// Schützt alle Routen hier
router.use(tenantManagerAuth);

// === Vorlagen-Routen (unverändert) ===
router.post('/templates', adminLegalMonitorController.createTemplate);
router.get('/templates', adminLegalMonitorController.getTemplates);
router.delete('/templates/:id', adminLegalMonitorController.deleteTemplate);
router.put('/templates/:id', adminLegalMonitorController.updateTemplate);
router.get('/business-partners', adminLegalMonitorController.getBusinessPartnersList);

// === Eintrags-Routen (angepasst) ===

// KORREKTUR: Diese Route ruft jetzt die neue, intelligente Parsing-Funktion auf
router.post(
    '/entries/parse-pdf', 
    upload.single('pdfFile'),
    adminLegalMonitorController.parseAndStorePdfArticles // ALT: parsePdfToEntry
);

router.post('/entries', adminLegalMonitorController.createEntry);
router.get('/entries', adminLegalMonitorController.getEntries);
router.put('/entries/:id', adminLegalMonitorController.updateEntry);
router.delete('/entries/:id', adminLegalMonitorController.deleteEntry);
router.get('/entries/:id/download-source', adminLegalMonitorController.getSignedUrlForSourceDocument);

module.exports = router;
