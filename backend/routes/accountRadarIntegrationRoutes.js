const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/accountRadarIntegrationController');
const { accountRadarApiAuth, requireIntegrationScope } = require('../middleware/accountRadarApiAuth');

const router = express.Router();

router.use(accountRadarApiAuth);
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `radar-token:${req.integration.tokenId}`,
  message: { error: 'rate_limit_exceeded', message: 'Maximal 120 API-Anfragen pro Minute erlaubt.' },
}));

router.get('/', controller.getApiInfo);
router.get('/accounts', requireIntegrationScope('accounts:read'), controller.listAccountsApi);
router.put('/accounts/:externalId', requireIntegrationScope('accounts:write'), controller.upsertAccountApi);
router.get('/tasks', requireIntegrationScope('tasks:read'), controller.listTasksApi);
router.put('/tasks/:externalId', requireIntegrationScope('tasks:write'), controller.upsertTaskApi);
router.get('/analytics', requireIntegrationScope('analytics:read'), controller.getAnalyticsApi);

module.exports = router;
