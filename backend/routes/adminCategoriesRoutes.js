// backend/routes/adminCategoriesRoutes.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategoryById,
    getAllIndustries
} = require('../controllers/adminCategoriesController');

router.use(adminAuth);
router.get('/', getAllCategories);
router.get('/industries', getAllIndustries);
router.post('/', createCategory);
router.get('/:id', getCategoryById);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;