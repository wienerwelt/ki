// backend/routes/businessPartnerRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const businessPartnerController = require('../controllers/businessPartnerController');

// Route zum Abrufen der Details des Business Partners des eingeloggten Benutzers
router.get('/me', authMiddleware, businessPartnerController.getMyBusinessPartner);

module.exports = router;