const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const softwareController = require('../controllers/softwareController');
const { requireTenantModule } = require('../services/tenantModuleService');

const router = express.Router();

router.use(authMiddleware);
router.use(requireTenantModule('content'));
router.get('/options', softwareController.getInternalOptions);
router.put('/:id/rating', softwareController.rateSoftware);
router.get('/', softwareController.getInternalCatalog);

module.exports = router;
