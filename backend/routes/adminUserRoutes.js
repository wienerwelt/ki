// backend/routes/adminUserRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth'); // KORREKTUR: Die Standard-Admin-Auth
const adminUserController = require('../controllers/adminUserController');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// KORREKTUR: Standard-Admin-Auth für alle Routen in dieser Datei verwenden
router.use(adminAuth);

router.get('/export/csv', adminUserController.exportUsersToCSV);
router.post('/import/csv', upload.single('csvfile'), adminUserController.importUsersFromCSV);

router.get('/', adminUserController.getAllUsers);
router.get('/:id', adminUserController.getUserById);
router.post('/', adminUserController.createUser);
router.put('/:id', adminUserController.updateUser);
router.delete('/:id', adminUserController.deleteUser);

module.exports = router;