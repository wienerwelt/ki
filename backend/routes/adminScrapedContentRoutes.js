// backend/routes/adminScrapedContentRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminScController = require('../controllers/adminScrapedContentController');

// All routes below require admin authentication
router.use(adminAuth);

router.get('/', adminScController.getAllScrapedContent);
router.get('/:id', adminScController.getScrapedContentById);
router.post('/', adminScController.createScrapedContent);
router.put('/:id', adminScController.updateScrapedContent);
router.delete('/:id', adminScController.deleteScrapedContent);

module.exports = router;