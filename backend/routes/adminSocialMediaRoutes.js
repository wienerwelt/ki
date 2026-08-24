// backend/routes/adminSocialMediaRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const adminAuth = require('../middleware/adminAuth');
const adminSocialMediaController = require('../controllers/adminSocialMediaController');

const graphicUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
        if (allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) return callback(null, true);
        return callback(new Error('Nur JPEG-, PNG-, WebP- oder AVIF-Bilder sind erlaubt.'));
    },
});

const receiveGraphicUpload = (req, res, next) => {
    graphicUpload.single('graphic')(req, res, (error) => {
        if (!error) return next();
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Die Grafik darf maximal 8 MB groß sein.'
            : error.message;
        return res.status(400).json({ message });
    });
};

router.use(adminAuth);

// Archivdaten dynamisch aus economic_statistics laden
router.get('/archive-files', adminSocialMediaController.getArchiveFiles);

// KI-Text und Grafikdaten generieren
router.post('/generate', adminSocialMediaController.generateSocialMediaPost);

// Galerie-Dateien laden
router.get('/gallery-files', adminSocialMediaController.getGalleryFiles);

// Fertige Social-Media-Dateien im Adminbereich ansehen oder herunterladen
router.get('/gallery-files/:folder/:filename/view', adminSocialMediaController.viewGalleryFile);
router.get('/gallery-files/:folder/:filename/download', adminSocialMediaController.downloadGalleryFile);

// Neue Hintergrundgrafik sicher optimieren und in /grafiken speichern
router.post('/gallery-files/grafiken', receiveGraphicUpload, adminSocialMediaController.uploadGalleryGraphic);

// Fertiges Bild speichern
router.post('/save', adminSocialMediaController.saveGeneratedImage);

// Galerie-Datei löschen
router.delete('/gallery-files', adminSocialMediaController.deleteGalleryFile);

module.exports = router;
