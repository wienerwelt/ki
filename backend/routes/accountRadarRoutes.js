const express = require('express');
const multer = require('multer');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middleware/authMiddleware');
const accountRadarController = require('../controllers/accountRadarController');
const accountRadarIntegrationController = require('../controllers/accountRadarIntegrationController');
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
