// backend/routes/adminUserRoutes.js
const express = require('express');
const router = express.Router();
const tenantManagerAuth = require('../middleware/tenantManagerAuth');
const adminUserController = require('../controllers/adminUserController');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const nameOk = /\.csv$/i.test(String(file.originalname || ''));
        const typeOk = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'].includes(String(file.mimetype || '').toLowerCase());
        return nameOk && typeOk ? cb(null, true) : cb(new Error('Nur CSV-Dateien sind erlaubt.'));
    },
});

// Standard-Admin-Auth für ALLE Routen in dieser Datei
router.use(tenantManagerAuth);

// ==========================================
// 1. STATISCHE ROUTEN (Spezial-Funktionen)
// Müssen zwingend ganz oben stehen!
// ==========================================
router.get('/import/template', adminUserController.getImportTemplate);
router.get('/export/csv', adminUserController.exportUsersToCSV);
router.post('/import/csv', upload.single('csvfile'), adminUserController.importUsersFromCSV);
router.get('/membership-levels', adminUserController.getManagedMembershipLevels);


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
