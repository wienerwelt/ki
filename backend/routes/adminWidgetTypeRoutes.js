// backend/routes/adminWidgetTypeRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminWtController = require('../controllers/adminWidgetTypeController');

// All routes below require admin authentication
router.use(adminAuth);

router.get('/', adminWtController.getAllWidgetTypes);
router.get('/:id', adminWtController.getWidgetTypeById);
router.post('/', adminWtController.createWidgetType);
router.put('/:id', adminWtController.updateWidgetType);
router.delete('/:id', adminWtController.deleteWidgetType);

module.exports = router;