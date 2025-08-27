// backend/routes/adminScrapedContentRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminScController = require('../controllers/adminScrapedContentController');

router.use(adminAuth);

// KORREKTUR: Statische Routen wie '/events' müssen VOR dynamischen Routen wie '/:id' stehen.
router.post('/events', adminScController.createManualEvent);
router.get('/events', adminScController.getAllScrapedEventsForAdmin);
router.put('/events/:id', adminScController.updateScrapedEvent);

// Allgemeine Routen
router.get('/', adminScController.getAllScrapedContent);
router.post('/', adminScController.createScrapedContent);

// Die dynamische Route mit :id kommt jetzt ZULETZT.
router.get('/:id', adminScController.getScrapedContentById);
router.put('/:id', adminScController.updateScrapedContent);
router.delete('/:id', adminScController.deleteScrapedContent);

module.exports = router;