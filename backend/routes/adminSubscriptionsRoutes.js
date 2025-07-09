// backend/routes/adminSubscriptionsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const { createSubscription } = require('../controllers/adminSubscriptionsController');

router.post('/', adminAuth, createSubscription);

module.exports = router;