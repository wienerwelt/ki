// backend/middleware/authorize.js
const jwt = require('jsonwebtoken');

/**
 * Middleware zur Autorisierung basierend auf Benutzerrollen.
 * @param {string[]} allowedRoles - Ein Array von Rollen, die Zugriff haben sollen.
 * @returns {function} Express-Middleware-Funktion.
 */
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        // Token aus dem Header holen
        const token = req.header('x-auth-token');

        // Prüfen, ob ein Token vorhanden ist
        if (!token) {
            return res.status(401).json({ message: 'Kein Token, Autorisierung verweigert' });
        }

        try {
            // Token verifizieren
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded.user; // Benutzerdaten aus dem Token zum Request-Objekt hinzufügen

            // Prüfen, ob die Rolle des Benutzers in der Liste der erlaubten Rollen enthalten ist
            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({ message: 'Zugriff verweigert. Sie haben nicht die erforderliche Rolle.' });
            }

            // Wenn die Rolle passt, zur nächsten Middleware oder Route weiterleiten
            next();
        } catch (err) {
            res.status(401).json({ message: 'Token ist nicht gültig' });
        }
    };
};

module.exports = authorize;
