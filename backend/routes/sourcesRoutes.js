// backend/routes/sourcesRoutes.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); // Standard-Authentifizierung für Nutzer
const {
    getAllApprovedSources,
    getPendingSourcesForVote,
    getCommunityTrustSources,
    getSourceCategories,
    getSourceById,
    createSource,
    voteOnSource,
    reportSource
} = require('../controllers/sourcesController');
const { requireTenantModule } = require('../services/tenantModuleService');
const requireContentModule = requireTenantModule('content');

// Routen, die öffentlich sind (keine Anmeldung erforderlich)
router.get('/', getAllApprovedSources);
router.get('/pending', auth, requireContentModule, getPendingSourcesForVote);
router.get('/community-trust', auth, requireContentModule, getCommunityTrustSources);
router.get('/categories', getSourceCategories);
router.get('/:id', auth, requireContentModule, getSourceById);

// Routen, die eine Anmeldung erfordern (auth Middleware)
router.post('/', auth, requireContentModule, createSource);
router.post('/:id/vote', auth, requireContentModule, voteOnSource);
router.post('/:id/report', auth, requireContentModule, reportSource);

module.exports = router;
