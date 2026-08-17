// backend/routes/adminRoleRoutes.js
const express = require('express');
const router = express.Router();
const tenantManagerAuth = require('../middleware/tenantManagerAuth');
const adminRoleController = require('../controllers/adminRoleController');

// Alle Routen hier sind nun durch die Standard-Admin-Middleware geschützt
router.use(tenantManagerAuth);

// Route zum Abrufen aller Rollen
router.get('/', adminRoleController.getAllRoles);

module.exports = router;
