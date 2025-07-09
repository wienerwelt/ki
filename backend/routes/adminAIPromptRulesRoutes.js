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
    duplicateAIPromptRule // Stellen Sie sicher, dass dieser Import vorhanden ist
} = require('../controllers/adminAIPromptRulesController');

router.use(adminAuth);

// GET / -> Holt alle Regeln
router.get('/', getAllAIPromptRules);

// POST / -> Erstellt eine neue Regel
router.post('/', createAIPromptRule);

// NEU: POST /:id/duplicate -> Dupliziert eine Regel
router.post('/:id/duplicate', duplicateAIPromptRule);

// POST /execute -> Führt eine Regel manuell aus
router.post('/execute', executeRule);

// PUT /:id -> Aktualisiert eine Regel
router.put('/:id', updateAIPromptRule);

// DELETE /:id -> Löscht eine Regel
router.delete('/:id', deleteAIPromptRule);

module.exports = router;
