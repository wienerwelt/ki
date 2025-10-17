// backend/routes/adminBpAccountsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminBpAccountsController = require('../controllers/adminBpAccountsController.js');

router.use(adminAuth);

// Spezifische Routen zuerst
router.get('/all-categories', adminBpAccountsController.getAllCategories);
router.get('/for-bp/:bpId', adminBpAccountsController.getAccountsForBusinessPartner);
router.post('/for-bp/:bpId', adminBpAccountsController.createAccount);

// Allgemeine Routen mit Parametern danach
router.get('/:accountId', adminBpAccountsController.getAccountById); // NEUE ROUTE HIER
router.put('/:accountId', adminBpAccountsController.updateAccount);
router.delete('/:accountId', adminBpAccountsController.deleteAccount);

module.exports = router;