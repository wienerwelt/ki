// backend/routes/adminBusinessPartnerRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const authorize = require('../middleware/authorize'); 
const adminBpController = require('../controllers/adminBusinessPartnerController');

// Diese Route ist für Admins UND Assistenten zugänglich.
router.get('/:id/levels', authorize(['admin', 'assistenz']), adminBpController.getMembershipLevels);

// === KORREKTUR START ===
// Middleware und Controller-Variable korrigiert.
// Diese Route ist ebenfalls für Admins UND Assistenten zugänglich.
router.put('/:id/tier', authorize(['admin', 'assistenz']), adminBpController.updateBusinessPartnerTier);
// === KORREKTUR ENDE ===

// Die folgenden Routen sind weiterhin NUR für Admins zugänglich.
router.get('/regions', adminAuth, adminBpController.getAllRegions);
router.get('/', adminAuth, adminBpController.getAllBusinessPartners);
router.get('/:id', adminAuth, adminBpController.getBusinessPartnerById);
router.post('/', adminAuth, adminBpController.createBusinessPartner);
router.put('/:id', adminAuth, adminBpController.updateBusinessPartner);
router.delete('/:id', adminAuth, adminBpController.deleteBusinessPartner);
router.get('/:id/user-stats', adminAuth, adminBpController.getBusinessPartnerUserStats);
router.get('/colorschemes/all', adminAuth, adminBpController.getAllColorSchemes);

module.exports = router;
