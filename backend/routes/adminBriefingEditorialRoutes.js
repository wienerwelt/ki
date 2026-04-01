const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

const { 
    getBriefingDraft, 
    updateBriefingDraft, 
    getDebugStatus,
    triggerManualGeneration,
    getAllPartners,
    publishBulkBriefing,
    publishBriefing,
    sendTestEmail, 
    deleteBriefingItem,
    updateBriefingSettings,
    getRawData,
    getRecipients
} = require('../controllers/adminBriefingEditorialController');

const isEditorialManager = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'assistenz')) {
        next();
    } else {
        res.status(403).json({ message: 'Zugriff verweigert.' });
    }
};

// Diese Zeile schützt bereits ALLE folgenden Routen mit authMiddleware & Rollen-Check
router.use(authMiddleware, isEditorialManager);

router.get('/draft', getBriefingDraft);
router.get('/partners', getAllPartners);
router.get('/debug-status', getDebugStatus);
router.post('/trigger-manual', triggerManualGeneration);
router.post('/publish-bulk', publishBulkBriefing);
router.put('/settings', updateBriefingSettings);
router.post('/test-email', sendTestEmail);

router.get('/raw-data', getRawData);
router.get('/recipients', getRecipients);

router.delete('/:id', deleteBriefingItem);
router.put('/:id', updateBriefingDraft);
router.post('/:id/publish', publishBriefing);

module.exports = router;