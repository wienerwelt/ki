// ===================================================================
// DATEI: backend/routes/adminBpActionsRoutes.js
// ===================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
    getActionsForBusinessPartner,
    createAction,
    updateAction,
    deleteAction,
    copyAction,
    uploadActionImage,
    getUploadedImages
} = require('../controllers/adminBpActionsController');

const authMiddleware = require('../middleware/authMiddleware');

// --- Multer-Setup für den Datei-Upload ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '..', '..', 'frontend', 'public', 'actions');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // KORRIGIERT: Nur einen temporären, eindeutigen Namen vergeben.
        // Die endgültige Umbenennung erfolgt im Controller, wo req.body zuverlässig verfügbar ist.
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB Limit
    fileFilter: function (req, file, cb) {
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
router.get('/images', getUploadedImages);
router.post('/:id/copy', copyAction);

module.exports = router;