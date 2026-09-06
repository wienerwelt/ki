const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const controller = require('../controllers/adminSalesLeadController');

const router = express.Router();
router.use(adminAuth);
router.get('/', controller.listSalesLeads);
router.patch('/:id/status', controller.updateSalesLeadStatus);

module.exports = router;
