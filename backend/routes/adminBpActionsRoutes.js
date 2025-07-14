const express = require('express');
const router = express.Router();
const {
    getActionsForBusinessPartner,
    createAction,
    updateAction,
    deleteAction
} = require('../controllers/adminBpActionsController');

// Middleware zur Authentifizierung (Annahme: existiert bereits)
const authMiddleware = require('../middleware/authMiddleware');

// Middleware zur Rollenprüfung
const isBpManager = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'assistenz')) {
        next();
    } else {
        res.status(403).json({ message: 'Zugriff verweigert: Unzureichende Berechtigungen.' });
    }
};

// Alle Routen sind durch die Authentifizierungs- und Rollen-Middleware geschützt
router.use(authMiddleware, isBpManager);

// Definiert die Endpunkte für die CRUD-Operationen
router.route('/')
    .get(getActionsForBusinessPartner)
    .post(createAction);

router.route('/:id')
    .put(updateAction)
    .delete(deleteAction);

module.exports = router;
