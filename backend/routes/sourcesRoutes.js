// backend/routes/sourcesRoutes.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); // Standard-Authentifizierung für Nutzer
const {
    getAllApprovedSources,
    getPendingSourcesForVote,
    getSourceById,
    createSource,
    voteOnSource,
    reportSource
} = require('../controllers/sourcesController');

// Routen, die öffentlich sind (keine Anmeldung erforderlich)
router.get('/', getAllApprovedSources);
router.get('/pending', getPendingSourcesForVote);
router.get('/:id', getSourceById);

// Routen, die eine Anmeldung erfordern (auth Middleware)
router.post('/', auth, createSource);
router.post('/:id/vote', auth, voteOnSource);
router.post('/:id/report', auth, reportSource);

module.exports = router;