// backend/routes/adminAdvertisementsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adController = require('../controllers/adminAdvertisementsController');

router.use(adminAuth);

router.get('/', adController.getAllAdvertisements);
router.post('/', adController.createAdvertisement);
router.put('/:id', adController.updateAdvertisement);
router.delete('/:id', adController.deleteAdvertisement);

module.exports = router;
