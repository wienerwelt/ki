// backend/routes/surveyRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const tenantManagerAuth = require('../middleware/tenantManagerAuth');
const { requireTenantModule } = require('../services/tenantModuleService');
const requireContentModule = requireTenantModule('content');
const surveyController = require('../controllers/surveyController');
router.use(authMiddleware);

// Routen für das Dashboard-Widget (USER)
router.get('/active', surveyController.getActiveSurveysForWidget);
router.post('/submit', surveyController.submitSurveyResponse);
router.get('/archive', surveyController.getArchivedSurveysForUser);
router.get('/:id/results', surveyController.getSurveyResults);

router.get('/admin', tenantManagerAuth, requireContentModule, surveyController.getSurveysForAdmin);
router.post('/admin', tenantManagerAuth, requireContentModule, surveyController.createSurvey);
router.get('/admin/:id/results', tenantManagerAuth, requireContentModule, surveyController.getSurveyResults);
router.get('/admin/:id', tenantManagerAuth, requireContentModule, surveyController.getSurveyForEdit);
router.put('/admin/:id', tenantManagerAuth, requireContentModule, surveyController.updateSurvey);
router.delete('/admin/:id', tenantManagerAuth, requireContentModule, surveyController.deleteSurvey);

module.exports = router;
