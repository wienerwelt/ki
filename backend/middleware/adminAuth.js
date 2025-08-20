// backend/middleware/adminAuth.js
const jwt = require('jsonwebtoken');

const adminAuth = (req, res, next) => {
    // Holen des Tokens aus dem Header
    const token = req.header('x-auth-token');

    // Prüfen, ob Token existiert
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        // Token verifizieren
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user; // User-Daten aus dem Token extrahieren

        // ======================================================
        // KORRIGIERTE PRÜFUNG
        // Wir definieren alle erlaubten Admin-Rollen in einer Liste.
        const allowedRoles = ['admin', 'assistenz'];
        
        // Wir prüfen, ob die Rolle des Benutzers in der Liste der erlaubten Rollen enthalten ist.
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied. Admin or Assistant role required.' });
        }
        // ======================================================

        next(); // Nächste Middleware/Route aufrufen
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = adminAuth;