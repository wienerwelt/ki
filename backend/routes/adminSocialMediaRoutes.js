const express = require('express');
const router = express.Router();

// Middleware für die Sicherheit einbinden
const adminAuth = require('../middleware/adminAuth');

// Den Controller einbinden
const adminSocialMediaController = require('../controllers/adminSocialMediaController');

// Ab hier greift die Admin-Authentifizierung für alle nachfolgenden Routen
router.use(adminAuth);

// --- Routen für den Social Media Generator ---

// POST-Route: Generiert den KI-Text und die Daten
router.post('/generate', adminSocialMediaController.generateSocialMediaPost);

// GET-Route: Liest alle Ordner (Logos, Grafiken, Social-Media) aus
router.get('/gallery-files', adminSocialMediaController.getGalleryFiles);

// POST-Route: Speichert das fertige Bild auf der Festplatte (Hier ist dein fehlender Endpunkt!)
router.post('/save', adminSocialMediaController.saveGeneratedImage);

// DELETE-Route: Löscht Bilder über das rote Mülleimer-Icon
router.delete('/gallery-files', adminSocialMediaController.deleteGalleryFile);

module.exports = router;