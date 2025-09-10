// backend/routes/surveyRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const surveyController = require('../controllers/surveyController');

// Alle Routen sind geschützt und erfordern eine Anmeldung
router.use(authMiddleware);

// Routen für das Dashboard-Widget
router.get('/active', surveyController.getActiveSurveysForWidget);
router.post('/submit', surveyController.submitSurveyResponse);

// Routen für den Admin-Bereich (erfordern Admin- oder Assistenz-Rolle)
const isBpManager = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'assistenz')) {
        next();
    } else {
        res.status(403).json({ message: 'Zugriff verweigert.' });
    }
};

router.get('/admin', isBpManager, surveyController.getSurveysForAdmin);
router.post('/admin', isBpManager, surveyController.createSurvey);
router.get('/admin/:id/results', isBpManager, surveyController.getSurveyResults);
router.get('/admin/:id', isBpManager, surveyController.getSurveyForEdit);
router.put('/admin/:id', isBpManager, surveyController.updateSurvey);

module.exports = router;