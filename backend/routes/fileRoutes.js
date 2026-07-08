// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/upload', authMiddleware, upload.single('file'), fileController.uploadFile);
router.get('/', authMiddleware, fileController.listFiles);
router.get('/:id/download', authMiddleware, fileController.getDownloadUrl);
router.post('/:id/public-link', authMiddleware, fileController.createPublicLink);
router.delete('/:id/public-link', authMiddleware, fileController.disablePublicLink);
router.delete('/:id', authMiddleware, fileController.deleteFile);
router.post('/:id/track-download', authMiddleware, fileController.trackDownload);
router.put('/:id', authMiddleware, fileController.updateFile);

module.exports = router;
