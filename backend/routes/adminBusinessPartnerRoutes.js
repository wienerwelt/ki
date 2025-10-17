// backend/routes/adminBusinessPartnerRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
// WICHTIG: Stelle sicher, dass der Pfad zu deinen Middleware-Dateien korrekt ist.
const adminAuth = require('../middleware/adminAuth'); // Nimmt an, dass diese Middleware Authentifizierung + Admin-Check macht.
const adminBpController = require('../controllers/adminBusinessPartnerController');

// Alle Routen in dieser Datei werden jetzt durch die Standard-Admin-Middleware geschützt
router.use(adminAuth);

// Multer-Konfiguration für Logo-Uploads (war bereits korrekt)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // z.B. 2 MB Limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Nur Bilddateien sind erlaubt!'), false);
        }
    }
});

// Bestehende Routen (unverändert)
router.get('/', adminBpController.getAllBusinessPartners);
router.post('/', adminBpController.createBusinessPartner);
router.get('/regions', adminBpController.getAllRegions);
router.get('/colorschemes/all', adminBpController.getAllColorSchemes);
router.get('/:id', adminBpController.getBusinessPartnerById);
router.put('/:id', adminBpController.updateBusinessPartner);
router.delete('/:id', adminBpController.deleteBusinessPartner);
router.get('/:id/user-stats', adminBpController.getBusinessPartnerUserStats);
router.get('/:id/levels', adminBpController.getMembershipLevels);
router.put('/:id/tier', adminBpController.updateBusinessPartnerTier);


// KORRIGIERTE ROUTE FÜR DEN LOGO-UPLOAD
// Der Pfad ist jetzt '/logo-upload' und die redundanten Middlewares sind entfernt.
router.post(
    '/logo-upload',
    upload.single('logo'),
    adminBpController.uploadBusinessPartnerLogo
);

module.exports = router;