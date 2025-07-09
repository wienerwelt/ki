// backend/routes/adminStatsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminStatsController = require('../controllers/adminStatsController');

// Alle Routen hier sind nur für Admins zugänglich
router.use(adminAuth);

// Route zum Abrufen der Nutzungsstatistiken
router.get('/usage', adminStatsController.getUsageStats);

module.exports = router;
