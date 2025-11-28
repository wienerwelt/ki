// backend/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.use(authMiddleware);

// Alle Benachrichtigungen laden (GET /api/notifications)
router.get('/', notificationController.getNotifications);

// Als gelesen markieren (PUT /api/notifications/read)
router.put('/read', notificationController.markAsRead);

module.exports = router;