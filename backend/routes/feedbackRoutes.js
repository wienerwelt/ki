// backend/routes/feedbackRoutes.js
const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const authMiddleware = require('../middleware/authMiddleware');
// NEU: Ihre Admin-Middleware wird importiert
const adminAuth = require('../middleware/adminAuth'); 

// Alle Routen hier erfordern eine Authentifizierung
router.use(authMiddleware);

router.get('/', feedbackController.getFeedbackItems);
router.post('/', feedbackController.createFeedbackItem);
router.post('/:itemId/vote', feedbackController.toggleVote);

// NEU: Diese Route ist zusätzlich durch die Admin-Middleware geschützt
router.put('/:itemId/status', adminAuth, feedbackController.updateFeedbackStatus);

module.exports = router;
