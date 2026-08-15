const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const softwareController = require('../controllers/softwareController');

const router = express.Router();

router.use(authMiddleware);
router.get('/options', softwareController.getInternalOptions);
router.put('/:id/rating', softwareController.rateSoftware);
router.get('/', softwareController.getInternalCatalog);

module.exports = router;
