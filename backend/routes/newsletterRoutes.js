const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const newsletter = require('../controllers/newsletterController');

// optional geschützt, Subscribe/Unsubscribe kann auch ohne Auth über Email laufen
router.post('/subscribe', auth, newsletter.subscribe);
router.post('/unsubscribe', auth, newsletter.unsubscribe);
router.get('/confirm/:token', newsletter.confirm);
router.get('/preferences/:token', newsletter.getPreferences);
router.post('/preferences/:token', newsletter.updatePreferences);
router.post('/unsubscribe/:token', newsletter.unsubscribeByToken);

module.exports = router;
