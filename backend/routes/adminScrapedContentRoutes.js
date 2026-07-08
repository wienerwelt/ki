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
router.get('/regions', adminScController.getAllRegions);

// Externe Event-Feeds für Drittanbieter
router.get('/event-feeds', adminScController.getEventFeedTokens);
router.post('/event-feeds', adminScController.createEventFeedToken);
router.put('/event-feeds/:id', adminScController.updateEventFeedToken);
router.delete('/event-feeds/:id', adminScController.deleteEventFeedToken);
router.post('/event-feeds/:id/regenerate', adminScController.regenerateEventFeedToken);

// ---> NEUE ROUTE FÜR DEN S3 DOWNLOAD <---
router.get('/statistics/:id/download', adminScController.downloadStatisticArchive);

// Allgemeine Routen
router.get('/', adminScController.getAllScrapedContent);
router.post('/', adminScController.createScrapedContent);

// Dynamische Routen mit :id am Ende
router.get('/:id', adminScController.getScrapedContentById);
router.put('/:id', adminScController.updateScrapedContent);
router.delete('/:id', adminScController.deleteScrapedContent);

router.post('/:id/deep-dive', adminScController.triggerDeepDive);

module.exports = router;