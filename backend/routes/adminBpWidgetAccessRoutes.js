// backend/routes/adminBpWidgetAccessRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminBpWidgetAccessController = require('../controllers/adminBpWidgetAccessController');

// All routes below require admin authentication
router.use(adminAuth);

router.get('/', adminBpWidgetAccessController.getAllBpWidgetAccess);
router.get('/:bpId', adminBpWidgetAccessController.getBpWidgetAccessByBpId); // Get all widgets for a specific BP
router.post('/grant', adminBpWidgetAccessController.grantWidgetAccess); // Using /grant to distinguish from general GET
router.delete('/revoke/:bpId/:widgetId', adminBpWidgetAccessController.revokeWidgetAccess);

module.exports = router;