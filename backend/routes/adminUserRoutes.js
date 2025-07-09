// backend/routes/adminUserRoutes.js
const express = require('express');
const router = express.Router();
const authorize = require('../middleware/authorize');
const adminUserController = require('../controllers/adminUserController');
const multer = require('multer'); // NEU

// NEU: Multer-Konfiguration für den Speicher im Arbeitsspeicher
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Alle nachfolgenden Routen erfordern 'admin' oder 'assistenz'
router.use(authorize(['admin', 'assistenz']));

// NEU: Routen für Import/Export
// Wichtig: Diese müssen vor den Routen mit Parametern wie /:id stehen.
router.get('/export/csv', adminUserController.exportUsersToCSV);
router.post('/import/csv', upload.single('csvfile'), adminUserController.importUsersFromCSV);

// Bestehende Routen
router.get('/', adminUserController.getAllUsers);
router.get('/:id', adminUserController.getUserById);
router.post('/', adminUserController.createUser);
router.put('/:id', adminUserController.updateUser);
router.delete('/:id', adminUserController.deleteUser);

module.exports = router;
