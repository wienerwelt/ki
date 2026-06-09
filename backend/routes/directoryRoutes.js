const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); // Normaler Login (kein Admin nötig)

const {
    getInternalDirectory,
    getProviderMentions,
    getProviderReviews,
    addProviderReview,
    getProviderNotes,
    addProviderNote
} = require('../controllers/directoryController');

// Alle Routen schützen
router.use(auth);

// Haupt-Verzeichnis laden
router.get('/internal', getInternalDirectory);

// Details: Mentions (Fachartikel)
router.get('/internal/:id/mentions', getProviderMentions);

// Details: Bewertungen (Reviews)
router.get('/internal/:id/reviews', getProviderReviews);
router.post('/internal/:id/reviews', addProviderReview);

// Details: Interne Notizen (Mandant)
router.get('/internal/:id/notes', getProviderNotes);
router.post('/internal/:id/notes', addProviderNote);

module.exports = router;