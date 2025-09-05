// backend/routes/adminRoleRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth'); // KORREKT: Die Standard-Admin-Middleware
const adminRoleController = require('../controllers/adminRoleController');

// Alle Routen hier sind nun durch die Standard-Admin-Middleware geschützt
router.use(adminAuth);

// Route zum Abrufen aller Rollen
router.get('/', adminRoleController.getAllRoles);

module.exports = router;