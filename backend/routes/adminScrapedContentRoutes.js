// backend/routes/adminScrapedContentRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminScController = require('../controllers/adminScrapedContentController');

router.use(adminAuth);

// Spezifischere Routen zuerst
router.get('/events', adminScController.getAllScrapedEventsForAdmin);
router.post('/events', adminScController.createManualEvent);
router.put('/events/:id', adminScController.updateScrapedEvent);
router.get('/regions', adminScController.getAllRegions); // NEUE ROUTE

// Allgemeine Routen
router.get('/', adminScController.getAllScrapedContent);
router.post('/', adminScController.createScrapedContent);

// Dynamische Routen mit :id am Ende
router.get('/:id', adminScController.getScrapedContentById);
router.put('/:id', adminScController.updateScrapedContent);
router.delete('/:id', adminScController.deleteScrapedContent);

module.exports = router;
