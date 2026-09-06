const express = require('express');
const tenantManagerAuth = require('../middleware/contentManagerAuth');
const adminAuth = require('../middleware/adminAuth');
const controller = require('../controllers/adminPublicAiAssistantController');

const router = express.Router();
router.use(tenantManagerAuth);
router.get('/', controller.getSettings);
router.put('/', controller.updateSettings);
router.post('/sync', controller.syncSources);
router.post('/rotate-site-key', adminAuth, controller.rotateSiteKey);
router.get('/pages', controller.getIndexedPages);

module.exports = router;
