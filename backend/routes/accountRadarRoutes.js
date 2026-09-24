const express = require('express');
const multer = require('multer');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middleware/authMiddleware');
const accountRadarController = require('../controllers/accountRadarController');
const accountRadarIntegrationController = require('../controllers/accountRadarIntegrationController');
const accountRadarTriggerController = require('../controllers/accountRadarTriggerController');
const accountRadarSourceController = require('../controllers/accountRadarSourceController');
const {
  ACCOUNT_RADAR_MANAGER_ROLES,
  ACCOUNT_RADAR_ROLES,
  requireTenantModule,
} = require('../services/tenantModuleService');
const { requireActiveSalesSubscription, requireSalesFeature } = require('../services/salesPlanService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(extension)) {
      return callback(new Error('Nur CSV-, XLSX- oder XLS-Dateien sind erlaubt.'));
    }
    return callback(null, true);
  },
});
const testMailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { message: 'Zu viele Testmails in kurzer Zeit. Bitte warten Sie einige Minuten.' },
});
const sourceActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { message: 'Zu viele Quellenprüfungen in kurzer Zeit. Bitte warten Sie einige Minuten.' },
});
const handleTableUpload = (controller) => (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Die Importdatei darf maximal 5 MB groß sein.'
        : error.message;
      return res.status(400).json({ message });
    }
    return controller(req, res, next);
  });
};

router.use(auth);
router.use(requireTenantModule('sales', { allowedRoles: ACCOUNT_RADAR_ROLES }));

const requireRadarManager = (req, res, next) => {
  if (ACCOUNT_RADAR_MANAGER_ROLES.includes(String(req.user?.role || '').toLowerCase())) return next();
  return res.status(403).json({ message: 'Diese Radar-Einstellung darf nur durch das Sales-Management geändert werden.' });
};

router.get('/entitlements', accountRadarController.getEntitlements);
router.use(requireActiveSalesSubscription);
router.get('/settings', accountRadarController.getSettings);
router.get('/market-signals', requireSalesFeature('contentTriggers'), accountRadarTriggerController.listMarketSignals);
router.post('/market-signals/:matchId/assign', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.assignMarketSignal);
router.post('/market-signals/:matchId/create-account', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.createAccountFromMarketSignal);
router.patch('/market-signals/:matchId/status', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.updateMarketSignalStatus);
router.get('/triggers', requireRadarManager, accountRadarTriggerController.list);
router.post('/triggers', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.create);
router.put('/triggers/:profileId', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.update);
router.delete('/triggers/:profileId', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.remove);
router.post('/triggers/preview', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.preview);
router.post('/triggers/:profileId/run', requireRadarManager, requireSalesFeature('contentTriggers'), accountRadarTriggerController.run);
router.get('/sources', requireRadarManager, requireSalesFeature('externalSources'), accountRadarSourceController.list);
router.post('/sources', requireRadarManager, requireSalesFeature('externalSources'), sourceActionLimiter, accountRadarSourceController.create);
router.post('/sources/:sourceId/run', requireRadarManager, requireSalesFeature('externalSources'), sourceActionLimiter, accountRadarSourceController.run);
router.patch('/sources/:sourceId', requireRadarManager, requireSalesFeature('externalSources'), accountRadarSourceController.update);
router.delete('/sources/:sourceId', requireRadarManager, requireSalesFeature('externalSources'), accountRadarSourceController.remove);
router.get('/analytics', requireSalesFeature('advancedAnalytics'), accountRadarController.getAnalytics);
router.get('/campaigns', accountRadarController.listCampaigns);
router.get('/campaigns/:campaignId/detail', accountRadarController.getCampaignDetail);
router.post('/campaigns', requireRadarManager, accountRadarController.createCampaign);
router.put('/campaigns/:campaignId', requireRadarManager, accountRadarController.updateCampaign);
router.put('/campaigns/:campaignId/assignments', requireRadarManager, accountRadarController.replaceCampaignAssignments);
router.put('/campaigns/signals/:signalId', accountRadarController.replaceSignalCampaigns);
router.get('/calendar-feed', requireRadarManager, accountRadarController.getCalendarFeed);
router.post('/calendar-feed/rotate', requireRadarManager, accountRadarController.rotateCalendarFeed);
router.delete('/calendar-feed', requireRadarManager, accountRadarController.disableCalendarFeed);
router.get('/data-quality', requireSalesFeature('dataQuality'), accountRadarIntegrationController.getDataQuality);
router.get('/integrations/tokens', requireRadarManager, requireSalesFeature('apiIntegration'), accountRadarIntegrationController.listTokens);
router.post('/integrations/tokens', requireRadarManager, requireSalesFeature('apiIntegration'), accountRadarIntegrationController.createToken);
router.delete('/integrations/tokens/:tokenId', requireRadarManager, requireSalesFeature('apiIntegration'), accountRadarIntegrationController.revokeToken);
router.put('/settings', requireRadarManager, accountRadarController.updateSettings);
router.get('/digest/preview', accountRadarController.previewDigest);
router.post('/digest/test', requireRadarManager, testMailLimiter, accountRadarController.sendTestDigest);
router.get('/exports/accounts.csv', accountRadarController.exportAccounts);
router.get('/exports/tasks.csv', accountRadarController.exportTasks);
router.post('/accounts/import', requireRadarManager, requireSalesFeature('dataImport'), handleTableUpload(accountRadarController.importAccounts));
router.post('/tasks/import', requireRadarManager, requireSalesFeature('dataImport'), handleTableUpload(accountRadarController.importTasks));

module.exports = router;
