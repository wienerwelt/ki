// backend/routes/adminBpWidgetAccessRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminBpWidgetAccessController = require('../controllers/adminBpWidgetAccessController');

// All routes below require admin authentication
router.use(adminAuth);

router.get('/', adminBpWidgetAccessController.getAllBpWidgetAccess);

// NEU: Route für die Installationsdetails (Muss vor den anderen IDs stehen um Konflikte zu vermeiden)
router.get('/:bpId/widget/:widgetId/installations', adminBpWidgetAccessController.getWidgetInstallationsByBp);

router.get('/:bpId', adminBpWidgetAccessController.getBpWidgetAccessByBpId); 
router.post('/grant', adminBpWidgetAccessController.grantWidgetAccess); 
router.delete('/revoke/:bpId/:widgetId', adminBpWidgetAccessController.revokeWidgetAccess);
router.put('/toggle-public/:bpId/:widgetId', adminBpWidgetAccessController.togglePublicAccess);
router.put('/update-order/:bpId', adminBpWidgetAccessController.updateWidgetOrder);

module.exports = router;