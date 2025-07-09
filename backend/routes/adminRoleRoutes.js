// backend/routes/adminRoleRoutes.js
const express = require('express');
const router = express.Router();
const authorize = require('../middleware/authorize'); // NEU: Import der flexiblen Middleware
const adminRoleController = require('../controllers/adminRoleController');

// Route zum Abrufen aller Rollen
// KORREKTUR: Erlaubt nun Admins und Assistenten den Zugriff.
router.get('/', authorize(['admin', 'assistenz']), adminRoleController.getAllRoles);

module.exports = router;
