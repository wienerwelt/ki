// backend/middleware/adminAuth.js
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
    
    // Korrekte Version
    return {
      id: decoded.id || decoded.userId || decoded.sub,
      role: decoded.role,
      email: decoded.email,
      username: decoded.username,
      business_partner_id: decoded.business_partner_id || null,
      contribution_score: decoded.contribution_score ?? 0,
    };
  }
  return null;
}

const adminAuth = (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    console.warn('[adminAuth] Zugriff verweigert: Kein Token vorhanden.');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('[adminAuth] Server-Fehler: JWT_SECRET fehlt.');
      return res.status(500).json({ message: 'Server misconfigured: JWT_SECRET missing' });
    }

    const decoded = jwt.verify(token, secret);
    const user = extractUserFromPayload(decoded);

    if (!user || !user.role) {
      console.warn('[adminAuth] Zugriff verweigert: Token ungültig (kein User/Rolle).');
      return res.status(401).json({ message: 'Token is not valid (no user/role)' });
    }

// === KORREKTUR: NUR 'admin' erlauben ===
const role = String(user.role).toLowerCase();
console.log(`[adminAuth] Prüfe Zugriff für Route: ${req.originalUrl}. User-Rolle: ${role}`);

if (role !== 'admin') {
  console.warn(`[adminAuth] Zugriff verweigert: Rolle '${role}' ist nicht 'admin'.`);
  return res.status(403).json({ message: 'Access denied. Admin role required.' });
}
// === Ende der Korrektur ===

    console.log('[adminAuth] Zugriff ERLAUBT. User an Controller weitergeleitet.');
    req.user = user;
    return next();
  } catch (err) {
    console.warn('[adminAuth] Zugriff verweigert: Token-Fehler.', err.message);
    return res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = adminAuth;
