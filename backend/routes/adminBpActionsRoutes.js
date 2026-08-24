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

const tenantManagerAuth = require('../middleware/tenantManagerAuth');
const softwareController = require('../controllers/softwareController');

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

const softwareLogoUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
        if (allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) return cb(null, true);
        return cb(new Error('Nur JPEG-, PNG-, WebP- oder AVIF-Logos sind erlaubt.'));
    },
});

const receiveSoftwareLogo = (req, res, next) => {
    softwareLogoUpload.single('softwareLogo')(req, res, (error) => {
        if (!error) return next();
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Das Logo darf maximal 5 MB groß sein.'
            : error.message;
        return res.status(400).json({ message });
    });
};

router.use(tenantManagerAuth);

router.get('/catalog/options', softwareController.getManagedOptions);
router.get('/software-logo/library', softwareController.getManagedLogoLibrary);
router.post('/software-logo/upload', receiveSoftwareLogo, softwareController.uploadSoftwareLogo);
router.route('/software')
    .get(softwareController.getManagedSoftware)
    .post(softwareController.createSoftware);
router.route('/software/:id')
    .put(softwareController.updateSoftware)
    .delete(softwareController.archiveSoftware);
router.route('/').get(getActionsForBusinessPartner).post(createAction);
router.route('/:id').put(updateAction).delete(deleteAction);
router.post('/upload', upload.single('actionImage'), uploadActionImage);
router.post('/:id/copy', copyAction);

module.exports = router;
