const express = require('express');
const router = express.Router();
const tenantManagerAuth = require('../middleware/tenantManagerAuth');
const memberNewsletter = require('../controllers/adminMemberNewsletterController');

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
router.get('/member-newsletters/recipients', memberNewsletter.previewRecipients);
router.get('/member-newsletters/history', memberNewsletter.history);
router.post('/member-newsletters/test', memberNewsletter.sendTest);
router.post('/member-newsletters/send', memberNewsletter.enqueue);

router.delete('/:id', deleteBriefingItem);
router.put('/:id', updateBriefingDraft);
router.post('/:id/publish', publishBriefing);

module.exports = router;
