// backend/routes/adminMonitorRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminMonitorController = require('../controllers/adminMonitorController');
const adminStatusController = require('../controllers/adminStatusController');

// --- Allgemeine Admin-Authentifizierung ---
router.use(adminAuth);

// --- Bestehende Monitor/Status-Routen ---
router.get('/activity', adminMonitorController.getActivityLogs);
router.get('/monthly-report-deliveries', adminMonitorController.getMonthlyReportDeliveries);
router.delete('/logs', adminMonitorController.deleteLogs);
router.get('/status', adminStatusController.getSystemHealth);

router.get('/archive-files', adminMonitorController.getArchiveFiles);
router.get('/archive-files/download', adminMonitorController.getArchiveDownloadUrl);

module.exports = router;
