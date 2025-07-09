// backend/routes/adminAIExecutionRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

const {
    executeRule,
    getJobStatusAndLogs // Stellt sicher, dass diese Funktion importiert wird
} = require('../controllers/adminAIExecutionController');

router.use(adminAuth);

// Route zum Starten eines KI-Jobs
router.post('/execute', executeRule);

// Route zum Abrufen des Job-Status und der Logs
router.get('/logs/:jobId', getJobStatusAndLogs);

module.exports = router;