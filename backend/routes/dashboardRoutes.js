// backend/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');
const { requireTenantModule } = require('../services/tenantModuleService');
const requireContentModule = requireTenantModule('content');

// Aktuelle (Default oder letzte) Config des eingeloggten Users
router.get('/config', authMiddleware, requireContentModule, dashboardController.getDashboardConfig);

// Upsert einer Config nach (user_id, name)
router.post('/config', authMiddleware, requireContentModule, dashboardController.saveDashboardConfig);

module.exports = router;
