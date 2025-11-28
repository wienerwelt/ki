// ===================================================================
// DATEI: backend/routes/adminBpActionsRoutes.js
// ===================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const {
    getActionsForBusinessPartner,
    createAction,
    updateAction,
    deleteAction,
    copyAction,
    uploadActionImage
} = require('../controllers/adminBpActionsController');

const authMiddleware = require('../middleware/authMiddleware');

// --- Multer-Setup für den Datei-Upload ---
const storage = multer.memoryStorage(); // Hält die Datei im RAM für S3

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB Limit (bleibt gleich)
    fileFilter: function (req, file, cb) { // Filter bleibt gleich
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Fehler: Nur die folgenden Bildformate sind erlaubt: ' + allowedTypes));
    }
});

const isBpManager = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'assistenz')) {
        next();
    } else {
        res.status(403).json({ message: 'Zugriff verweigert.' });
    }
};

router.use(authMiddleware, isBpManager);

router.route('/').get(getActionsForBusinessPartner).post(createAction);
router.route('/:id').put(updateAction).delete(deleteAction);
router.post('/upload', upload.single('actionImage'), uploadActionImage);
router.post('/:id/copy', copyAction);

module.exports = router;