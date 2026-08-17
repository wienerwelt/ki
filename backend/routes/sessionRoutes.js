// backend/routes/sessionRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware'); // Schutz für eingeloggte Benutzer
const sessionController = require('../controllers/sessionController');

// Route zum Erneuern der Session.
// authMiddleware stellt sicher, dass nur ein eingeloggter Benutzer mit gültigem Token zugreifen kann.

// KORREKTUR: Der Funktionsname wurde von 'renewToken' auf 'renew' geändert, 
// damit er mit dem Export im sessionController übereinstimmt.
router.post('/renew', authMiddleware, sessionController.renew);
router.get('/status', authMiddleware, sessionController.status);

module.exports = router;
