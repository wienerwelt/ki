// backend/routes/adminMonitorRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminMonitorController = require('../controllers/adminMonitorController');

// Alle Routen hier sind nur für Admins, die Middleware wird auf alle angewendet.
router.use(adminAuth);

// Bestehende Route zum Abrufen der Logs
// GET /api/admin/monitor/activity
router.get('/activity', adminMonitorController.getActivityLogs);

// NEUE Route zum Löschen der Logs
// DELETE /api/admin/monitor/logs
router.delete('/logs', adminMonitorController.deleteLogs);

module.exports = router;
