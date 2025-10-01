// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

router.use(authMiddleware);

// Bestehende Routen
router.get('/me', userController.getProfile);
router.put('/me', userController.updateProfile);
router.post('/mark-welcome-seen', userController.markWelcomeAsSeen);
router.get('/favorites', userController.getFavorites);
router.post('/favorites', userController.addFavorite);
router.delete('/favorites/:externalId', userController.removeFavorite);
router.get('/contribution-history', userController.getContributionHistory);

// Routen für benutzerdefinierte Tags
router.get('/tags', userController.getUserTags);
router.post('/tags', userController.addUserTag);

// GEÄNDERT: Die Route erwartet jetzt den Tag-Namen als Teil der URL.
router.delete('/tags/:tagName', userController.removeUserTag);

module.exports = router;