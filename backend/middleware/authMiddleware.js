// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  console.log(`[AuthMiddleware] für Route ${req.originalUrl} wird ausgeführt...`);

  // 1. Token aus Header ODER Cookie holen
  const headerToken = req.header('x-auth-token');
  const cookieToken = req.cookies?.token; // <-- von cookie-parser bereitgestellt

  const token = headerToken || cookieToken;

  if (!token) {
    console.error('[AuthMiddleware] Fehler: Kein Token im Header oder Cookie gefunden.');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    console.log('[AuthMiddleware] Token gefunden, versuche zu verifizieren:', token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log('[AuthMiddleware] Token erfolgreich verifiziert. Entschlüsselte Benutzerdaten:', decoded.user);

    req.user = decoded.user;
    next();
  } catch (err) {
    console.error('[AuthMiddleware] Fehler: Token ist ungültig.', err.message);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = authMiddleware;
