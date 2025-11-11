// backend/routes/adminAIContentRoutes.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const { 
    getAllAIContent, 
    updateAIContent, 
    deleteAIContent,
    deleteMultipleAIContent // Controller bleibt derselbe
} = require('../controllers/adminAIContentController');

router.use(adminAuth);

router.get('/', getAllAIContent);
router.put('/:id', updateAIContent);
router.delete('/:id', deleteAIContent);
router.post('/delete-multiple', deleteMultipleAIContent);

module.exports = router;