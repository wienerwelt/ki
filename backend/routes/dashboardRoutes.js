// backend/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.get('/config', authMiddleware, dashboardController.getDashboardConfig);
router.post('/config', authMiddleware, dashboardController.saveDashboardConfig);

module.exports = router;