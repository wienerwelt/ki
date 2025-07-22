// backend/routes/adminSubscriptionsRoutes.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth'); // Middleware nur für Admins
const auth = require('../middleware/authMiddleware');      // Middleware für JEDEN eingeloggten Nutzer
const controller = require('../controllers/adminSubscriptionsController');

// ========================================================================
// == Route für alle eingeloggten Nutzer
// ========================================================================

// Diese Route ist nur durch die allgemeine `auth`-Middleware geschützt.
// Jeder eingeloggte Nutzer (Admin, Assistent, etc.) kann hier ein "Hot Topic"-Abo erstellen.
router.post('/', auth, controller.createSubscription);


// ========================================================================
// == Sicherheits-Grenze: Zukünftiger Admin-Bereich
// ========================================================================

// Falls du in Zukunft administrative Routen für Abonnements hinzufügen möchtest
// (z.B. das Auflisten aller Abos), kannst du hier die adminAuth-Middleware aktivieren.
// Alle Routen, die NACH dieser (auskommentierten) Zeile folgen, wären dann nur für Admins.
// router.use(adminAuth);
//
// Beispiel für eine zukünftige Admin-Route:
// router.get('/all', controller.getAllSubscriptions); 

module.exports = router;
