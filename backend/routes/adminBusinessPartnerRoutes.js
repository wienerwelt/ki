// backend/routes/adminBusinessPartnerRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminBpController = require('../controllers/adminBusinessPartnerController');

// Alle Routen in dieser Datei werden jetzt durch die Standard-Admin-Middleware geschützt
router.use(adminAuth);

// Routen
router.get('/:id/levels', adminBpController.getMembershipLevels);
router.put('/:id/tier', adminBpController.updateBusinessPartnerTier);
router.get('/regions', adminBpController.getAllRegions);
router.get('/', adminBpController.getAllBusinessPartners);
router.get('/:id', adminBpController.getBusinessPartnerById);
router.post('/', adminBpController.createBusinessPartner);
router.put('/:id', adminBpController.updateBusinessPartner);
router.delete('/:id', adminBpController.deleteBusinessPartner);
router.get('/:id/user-stats', adminBpController.getBusinessPartnerUserStats);
router.get('/colorschemes/all', adminBpController.getAllColorSchemes);

module.exports = router;