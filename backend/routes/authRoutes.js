// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route für die Registrierung
router.post('/register', authController.register);

// Route für den Login
router.post('/login', authController.login);

// NEU: Route für den Google Token Login
router.post('/google', authController.googleLogin);

module.exports = router;