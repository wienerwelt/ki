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
    getAllIndustries,
    getSoftwareCategories,
    createSoftwareCategory,
    updateSoftwareCategory,
    deleteSoftwareCategory
} = require('../controllers/adminCategoriesController');

router.use(adminAuth);
router.get('/', getAllCategories);
router.get('/industries', getAllIndustries);
router.get('/software', getSoftwareCategories);
router.post('/software', createSoftwareCategory);
router.put('/software/:id', updateSoftwareCategory);
router.delete('/software/:id', deleteSoftwareCategory);
router.post('/', createCategory);
router.get('/:id', getCategoryById);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;
