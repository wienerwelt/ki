// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const FILE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const upload = multer({
  storage,
  limits: { fileSize: FILE_UPLOAD_MAX_BYTES, files: 1 },
});

const requireFileManager = (req, res, next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'assistenz') {
    return res.status(403).json({ message: 'Nur Administratoren und Assistenten dürfen Dateien hochladen.' });
  }
  return next();
};

const receiveSingleFile = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Die Datei ist größer als das erlaubte Maximum von 50 MB.' });
    }
    if (error) return next(error);
    return next();
  });
};

router.post('/upload', authMiddleware, requireFileManager, receiveSingleFile, fileController.uploadFile);
router.get('/', authMiddleware, fileController.listFiles);
router.get('/:id/download', authMiddleware, fileController.getDownloadUrl);
router.post('/:id/public-link', authMiddleware, fileController.createPublicLink);
router.delete('/:id/public-link', authMiddleware, fileController.disablePublicLink);
router.delete('/:id', authMiddleware, fileController.deleteFile);
router.post('/:id/track-download', authMiddleware, fileController.trackDownload);
router.put('/:id', authMiddleware, fileController.updateFile);

module.exports = router;
