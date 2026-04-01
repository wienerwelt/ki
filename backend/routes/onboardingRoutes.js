const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const onboardingController = require('../controllers/onboardingController');

// Alle Onboarding-Routen sind geschützt (Nutzer muss eingeloggt sein)
router.use(authMiddleware);

router.get('/data', onboardingController.getOnboardingData);
router.post('/complete', onboardingController.completeOnboarding);

module.exports = router;