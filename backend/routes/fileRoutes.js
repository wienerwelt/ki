// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/upload', authMiddleware, upload.single('file'), fileController.uploadFile);
router.get('/', authMiddleware, fileController.listFiles);
router.get('/:id/download', authMiddleware, fileController.getDownloadUrl);
router.delete('/:id', authMiddleware, fileController.deleteFile);
router.post('/:id/track-download', authMiddleware, fileController.trackDownload);

// NEU: Route zum Bearbeiten der Datei-Metadaten (Name, Beschreibung, Tags)
router.put('/:id', authMiddleware, fileController.updateFile);

module.exports = router;