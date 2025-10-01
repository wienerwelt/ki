// backend/routes/adminAIContentRoutes.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const { 
    getAllAIContent, 
    updateAIContent, 
    deleteAIContent,
    deleteMultipleAIContent // NEU: Controller importieren
} = require('../controllers/adminAIContentController');

router.use(adminAuth);

router.get('/', getAllAIContent);
router.put('/:id', updateAIContent);
router.delete('/:id', deleteAIContent);

// NEU: Route für die Mehrfach-Löschung
router.delete('/', deleteMultipleAIContent);

module.exports = router;