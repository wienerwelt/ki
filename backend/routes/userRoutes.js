// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// Alle Routen hier sind für eingeloggte Benutzer
router.use(authMiddleware);

// Route zum Abrufen des eigenen Profils
router.get('/me', userController.getProfile);

// Route zum Aktualisieren des eigenen Profils
router.put('/me', userController.updateProfile);

// Fügen Sie diese Route zu Ihrer userRoutes-Datei hinzu
router.post('/mark-welcome-seen', authMiddleware, userController.markWelcomeAsSeen);

// --- NEUE ROUTEN FÜR BENUTZER-FAVORITEN ---
router.get('/favorites', authMiddleware, userController.getFavorites);
router.post('/favorites', authMiddleware, userController.addFavorite);
router.delete('/favorites/:externalId', authMiddleware, userController.removeFavorite);

module.exports = router;
