// backend/routes/adminAIContentRoutes.js

const express = require('express');
const router = express.Router(); // KORREKTUR: Diese Zeile hat gefehlt
const adminAuth = require('../middleware/adminAuth');
const { 
    getAllAIContent, 
    updateAIContent, 
    deleteAIContent 
} = require('../controllers/adminAIContentController');

// Alle Routen in dieser Datei mit Admin-Authentifizierung schützen
router.use(adminAuth);

// GET /api/admin/ai-content - Alle KI-Inhalte abrufen
router.get('/', getAllAIContent);

// PUT /api/admin/ai-content/:id - Einen KI-Inhalt aktualisieren
router.put('/:id', updateAIContent);

// DELETE /api/admin/ai-content/:id - Einen KI-Inhalt löschen
router.delete('/:id', deleteAIContent);

module.exports = router;