// backend/routes/adminBpAccountsRoutes.js
const express = require('express');
const router = express.Router();
const accountRadarManagerAuth = require('../middleware/accountRadarManagerAuth');
const adminBpAccountsController = require('../controllers/adminBpAccountsController.js');

router.use(accountRadarManagerAuth);

// Spezifische Routen zuerst
router.get('/all-categories', adminBpAccountsController.getAllCategories);
router.get('/for-bp/:bpId/team', adminBpAccountsController.getAccountTeamForBusinessPartner);
router.get('/for-bp/:bpId', adminBpAccountsController.getAccountsForBusinessPartner);
router.post('/for-bp/:bpId', adminBpAccountsController.createAccount);
router.put('/contacts/:contactId', adminBpAccountsController.updateContact);
router.delete('/contacts/:contactId', adminBpAccountsController.deleteContact);
router.post('/:accountId/contacts', adminBpAccountsController.createContact);

// Allgemeine Routen mit Parametern danach
router.get('/:accountId', adminBpAccountsController.getAccountById); // NEUE ROUTE HIER
router.put('/:accountId', adminBpAccountsController.updateAccount);
router.delete('/:accountId', adminBpAccountsController.deleteAccount);

module.exports = router;
