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

module.exports = router;
