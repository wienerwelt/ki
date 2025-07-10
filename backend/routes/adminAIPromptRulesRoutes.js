// backend/routes/adminAIPromptRulesRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

const {
    getAllAIPromptRules,
    createAIPromptRule,
    updateAIPromptRule,
    deleteAIPromptRule,
    executeRule,
    duplicateAIPromptRule,
    getAIProviders // NEU: Importiere die neue Funktion
} = require('../controllers/adminAIPromptRulesController');

router.use(adminAuth);

// GET / -> Holt alle Regeln
router.get('/', getAllAIPromptRules);

// NEU: GET /providers -> Holt die Liste der verfügbaren KI-Anbieter
router.get('/providers', getAIProviders);

// POST / -> Erstellt eine neue Regel
router.post('/', createAIPromptRule);

// POST /:id/duplicate -> Dupliziert eine Regel
router.post('/:id/duplicate', duplicateAIPromptRule);

// POST /execute -> Führt eine Regel manuell aus
router.post('/execute', executeRule);

// PUT /:id -> Aktualisiert eine Regel
router.put('/:id', updateAIPromptRule);

// DELETE /:id -> Löscht eine Regel
router.delete('/:id', deleteAIPromptRule);

module.exports = router;
