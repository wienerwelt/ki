const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');

const {
    getAllProvidersAdmin,
    getProviderDetailsAdmin,
    createProviderAdmin,
    updateProviderAdmin,
    deleteProviderAdmin,
    searchAddress,
    getAddressDetails,
    geocodeAddress
} = require('../controllers/adminDirectoryController');

// Multer im RAM für Sharp-Bildverarbeitung
const upload = multer({ storage: multer.memoryStorage() });

const { autoFillFromGoogle } = require('../controllers/adminDirectoryPlacesController');

// Alle Routen hier sind Admin-Only
router.use(adminAuth);

// ----------------------------------------------------
// STATISCHE ROUTEN (Müssen IMMER vor /:id stehen!)
// ----------------------------------------------------
router.get('/google-fill', autoFillFromGoogle);
router.get('/address-search', searchAddress);
router.get('/address-detail', getAddressDetails);
router.get('/geocode', geocodeAddress);
router.get('/', getAllProvidersAdmin);

// ----------------------------------------------------
// DYNAMISCHE ROUTEN (Mit :id Parametern)
// ----------------------------------------------------
router.get('/:id', getProviderDetailsAdmin);

// Bei POST und PUT erlauben wir den Upload eines Bildes im Feld 'logo'
router.post('/', upload.single('logo'), createProviderAdmin);
router.put('/:id', upload.single('logo'), updateProviderAdmin);

router.delete('/:id', deleteProviderAdmin);

module.exports = router;