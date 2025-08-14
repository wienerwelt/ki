// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // 1. Loggen, dass das Middleware überhaupt gestartet wird.
    console.log(`[AuthMiddleware] für Route ${req.originalUrl} wird ausgeführt...`);

    const token = req.header('x-auth-token');

    if (!token) {
        // 2. Loggen, wenn kein Token gefunden wird.
        console.error('[AuthMiddleware] Fehler: Kein Token im Header gefunden.');
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        // 3. Loggen des Tokens vor der Verifizierung.
        console.log('[AuthMiddleware] Token gefunden, versuche zu verifizieren:', token);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 4. Loggen der entschlüsselten Benutzerdaten.
        console.log('[AuthMiddleware] Token erfolgreich verifiziert. Entschlüsselte Benutzerdaten:', decoded.user);
        
        req.user = decoded.user;
        next(); // Wichtig: Anfrage an den nächsten Schritt (Controller) weitergeben.
    } catch (err) {
        // 5. Loggen, wenn die Token-Verifizierung fehlschlägt.
        console.error('[AuthMiddleware] Fehler: Token ist ungültig.', err.message);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = authMiddleware;
