// backend/routes/adminMonitorRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminMonitorController = require('../controllers/adminMonitorController');
const adminStatusController = require('../controllers/adminStatusController');

const authorize = require('../middleware/authorize');
const jwt = require('jsonwebtoken');


// --- Spezielle Route (Bull Board Auth) ---
router.get('/jobs-auth', authorize(['admin', 'assistenz']), (req, res) => {
  try {
    const token = req.cookies.token || req.header('x-auth-token') || req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).send('Authentifizierung für Job-Dashboard fehlgeschlagen.');
    }
    
    res.cookie('bull-auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/api/admin/jobs',
      maxAge: 60 * 1000,
    });

    res.redirect('/api/admin/jobs');

  } catch (error) {
    console.error('Fehler bei der Bull Board-Authentifizierung:', error);
    res.status(500).send('Interner Serverfehler beim Starten des Job-Dashboards.');
  }
});


// --- Allgemeine Admin-Authentifizierung ---
router.use(adminAuth);

// --- Bestehende Monitor/Status-Routen ---
router.get('/activity', adminMonitorController.getActivityLogs);
router.delete('/logs', adminMonitorController.deleteLogs);
router.get('/status', adminStatusController.getSystemHealth);

// --- ENTFERNT ---
// Die Routen für /templates und /entries wurden in adminLegalMonitorRoutes.js verschoben.

module.exports = router;