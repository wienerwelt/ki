const express = require('express');
const router = express.Router();
const tenantManagerAuth = require('../middleware/tenantManagerAuth');

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

router.use(tenantManagerAuth);

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
