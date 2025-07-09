// backend/routes/sessionRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware'); // Schutz für eingeloggte Benutzer
const sessionController = require('../controllers/sessionController');

// Route zum Erneuern der Session.
// authMiddleware stellt sicher, dass nur ein eingeloggter Benutzer mit gültigem Token zugreifen kann.
router.post('/renew', authMiddleware, sessionController.renewToken);

module.exports = router;
