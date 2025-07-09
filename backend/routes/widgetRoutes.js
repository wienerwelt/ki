// backend/routes/widgetRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const widgetController = require('../controllers/widgetController');

router.get('/types', authMiddleware, widgetController.getAvailableWidgetTypes);

module.exports = router;