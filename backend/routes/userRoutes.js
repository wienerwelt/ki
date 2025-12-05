// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// NEU: Multer für den Datei-Upload im Arbeitsspeicher konfigurieren
// Dies ist notwendig, damit wir die Datei an S3 streamen können.
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // z.B. 5MB Limit
});

// --- ÖFFENTLICHE ROUTE (NEU) ---
// Muss VOR authMiddleware stehen!
router.get('/public/:userId', userController.getPublicUserProfile);

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

// --- Avatar Routen ---
// Route für den Avatar-Upload
router.post('/me/avatar', upload.single('avatar'), userController.uploadAvatar);
// NEU: Route für den Avatar-Löschvorgang
router.delete('/me/avatar', userController.deleteAvatar);

router.get('/activities', userController.getUserActivities);

router.get('/search', userController.searchUsers);


module.exports = router;