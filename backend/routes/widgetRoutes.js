// backend/routes/widgetRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const widgetController = require('../controllers/widgetController');
const { requireTenantModule } = require('../services/tenantModuleService');

router.get('/types', authMiddleware, requireTenantModule('content'), widgetController.getAvailableWidgetTypes);

module.exports = router;
