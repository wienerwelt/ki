// backend/routes/adminStatusRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminStatusController = require('../controllers/adminStatusController');

// Alle Routen hier sind nur für Admins. Die Middleware wird bereits in der server.js angewendet.
router.use(adminAuth);

// GET /api/admin/monitor/status
router.get('/status', adminStatusController.getSystemHealth);

module.exports = router;