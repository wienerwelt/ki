// backend/routes/adminMonitorRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminMonitorController = require('../controllers/adminMonitorController');
const adminStatusController = require('../controllers/adminStatusController');

const authorize = require('../middleware/authorize');
const jwt = require('jsonwebtoken');


// ✅ KORREKTE REIHENFOLGE

// 1. Zuerst die spezielle Route mit ihrer eigenen Berechtigungs-Middleware definieren.
// Diese Route wird nun NICHT MEHR von dem folgenden router.use(adminAuth) beeinflusst.
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


// 2. DANACH die allgemeine Middleware für alle restlichen Routen in dieser Datei setzen.
router.use(adminAuth);

// 3. Alle folgenden Routen sind jetzt automatisch durch adminAuth geschützt.
router.get('/activity', adminMonitorController.getActivityLogs);
router.delete('/logs', adminMonitorController.deleteLogs);
router.get('/status', adminStatusController.getSystemHealth);

module.exports = router;