// backend/routes/adminBpCompetitorsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminCompetitorsController = require('../controllers/adminBpCompetitorsController.js');

router.use(adminAuth);

router.get('/for-account/:accountId', adminCompetitorsController.getCompetitorsForAccount);
router.post('/for-account/:accountId', adminCompetitorsController.createCompetitor);
router.put('/:competitorId', adminCompetitorsController.updateCompetitor);
router.delete('/:competitorId', adminCompetitorsController.deleteCompetitor);

module.exports = router;