// backend/middleware/authorize.js
const jwt = require('jsonwebtoken');

function getTokenFromRequest(req) {
  // 1) x-auth-token
  let token = req.header('x-auth-token');

  // 2) Authorization: Bearer <jwt>
  if (!token) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) token = auth.slice(7);
  }

  // 3) Cookie "token"
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  return token;
}

function extractUserFromPayload(decoded) {
  if (decoded && typeof decoded === 'object') {
    if (decoded.user && typeof decoded.user === 'object') return decoded.user;
    return {
      id: decoded.id || decoded.userId || decoded.sub,
      role: decoded.role || (decoded.user && decoded.user.role),
      email: decoded.email || (decoded.user && decoded.user.email),
      username: decoded.username || (decoded.user && decoded.user.username),
    };
  }
  return null;
}

/**
 * Autorisierung nach Rollen.
 * @param {string[]} allowedRoles
 */
const authorize = (allowedRoles = []) => {
  const allowed = (allowedRoles || []).map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: 'Kein Token, Autorisierung verweigert' });
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return res.status(500).json({ message: 'Serverfehler: JWT_SECRET fehlt' });
      }

      const decoded = jwt.verify(token, secret);
      const user = extractUserFromPayload(decoded);
      if (!user || !user.role) {
        return res.status(401).json({ message: 'Token ist nicht gültig (keine Benutzer-/Rolleninfo)' });
      }

      const role = String(user.role).toLowerCase();
      if (allowed.length && !allowed.includes(role)) {
        return res.status(403).json({ message: 'Zugriff verweigert. Rolle nicht ausreichend.' });
      }

      req.user = user;
      return next();
    } catch (err) {
      return res.status(401).json({ message: 'Token ist nicht gültig' });
    }
  };
};

module.exports = authorize;
