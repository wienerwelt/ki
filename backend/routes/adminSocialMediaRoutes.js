// backend/routes/adminSocialMediaRoutes.js
const express = require('express');
const router = express.Router();

const adminAuth = require('../middleware/adminAuth');
const adminSocialMediaController = require('../controllers/adminSocialMediaController');

router.use(adminAuth);

// Archivdaten dynamisch aus economic_statistics laden
router.get('/archive-files', adminSocialMediaController.getArchiveFiles);

// KI-Text und Grafikdaten generieren
router.post('/generate', adminSocialMediaController.generateSocialMediaPost);

// Galerie-Dateien laden
router.get('/gallery-files', adminSocialMediaController.getGalleryFiles);

// Fertiges Bild speichern
router.post('/save', adminSocialMediaController.saveGeneratedImage);

// Galerie-Datei löschen
router.delete('/gallery-files', adminSocialMediaController.deleteGalleryFile);

module.exports = router;
