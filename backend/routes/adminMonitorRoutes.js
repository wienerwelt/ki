// backend/routes/adminMonitorRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminMonitorController = require('../controllers/adminMonitorController');
const adminStatusController = require('../controllers/adminStatusController'); // NEU

router.use(adminAuth);

// Bestehende Routen für Logs
router.get('/activity', adminMonitorController.getActivityLogs);
router.delete('/logs', adminMonitorController.deleteLogs);

// NEU: Route für den System-Gesundheitszustand
router.get('/status', adminStatusController.getSystemHealth);

module.exports = router;