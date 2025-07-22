// backend/routes/adminAIPromptRulesRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const controller = require('../controllers/adminAIPromptRulesController');

router.use(adminAuth);

// --- GET Routes ---
router.get('/', controller.getAllAIPromptRules);
router.get('/providers', controller.getAIProviders);

// --- POST Routes ---
router.post('/', controller.createAIPromptRule);
router.post('/:id/duplicate', controller.duplicateAIPromptRule);
router.post('/execute', controller.executeRule);

// Route zum Erstellen eines ABONNEMENTS für einen NUTZER aus einer Regel heraus
router.post('/:id/schedule', controller.scheduleRule);

// NEU: Route zum manuellen Starten (Triggern) einer REDAKTIONELLEN Regel
router.post('/:id/trigger', controller.triggerRule);


// --- PUT Route ---
router.put('/:id', controller.updateAIPromptRule);

// --- DELETE Route ---
router.delete('/:id', controller.deleteAIPromptRule);

module.exports = router;
