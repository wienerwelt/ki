// backend/routes/adminUserRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminUserController = require('../controllers/adminUserController');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Standard-Admin-Auth für ALLE Routen in dieser Datei
router.use(adminAuth);

// ==========================================
// 1. STATISCHE ROUTEN (Spezial-Funktionen)
// Müssen zwingend ganz oben stehen!
// ==========================================
router.get('/import/template', adminUserController.getImportTemplate);
router.get('/export/csv', adminUserController.exportUsersToCSV);
router.post('/import/csv', upload.single('csvfile'), adminUserController.importUsersFromCSV);


// ==========================================
// 2. DYNAMISCHE ROUTEN (Standard CRUD)
// ==========================================
router.get('/', adminUserController.getAllUsers);
router.post('/', adminUserController.createUser);

// Ab hier greifen Parameter wie "id"
router.get('/:id', adminUserController.getUserById);
router.put('/:id', adminUserController.updateUser);
router.delete('/:id', adminUserController.deleteUser);


// ==========================================
// 3. SUB-RESSOURCEN (Dashboards & Widgets)
// ==========================================
// WICHTIG: Die Parameternamen (:id und :widgetKey) müssen exakt mit dem Controller übereinstimmen!
router.delete('/:id/dashboard/widget/:widgetKey', adminUserController.removeWidgetFromUserDashboard);

// Falls getUserStatistics auch req.params.id nutzt, hier ebenfalls konsistent :id verwenden:
router.get('/:id/statistics', adminUserController.getUserStatistics);


module.exports = router;