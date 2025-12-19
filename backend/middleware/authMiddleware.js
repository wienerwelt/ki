// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

function getTokenFromRequest(req) {
  let token = req.header('x-auth-token');
  if (!token) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) token = auth.slice(7);
  }
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  return token;
}

function extractUserFromPayload(decoded) {
  if (decoded && typeof decoded === 'object') {
    // Manche JWTs haben die Daten direkt, manche unter 'user'
    const userData = (decoded.user && typeof decoded.user === 'object') ? decoded.user : decoded;
    
    return {
      id: userData.id || userData.userId || userData.sub,
      role: userData.role,
      email: userData.email,
      username: userData.username,
      business_partner_id: userData.business_partner_id || null,
      contribution_score: userData.contribution_score ?? 0,
      last_login_at: userData.last_login_at, // DB Wert (ändert sich)
      
      // NEU: Statischer Zeitstempel des Logins (Token-Erstellung)
      // 'iat' ist "Issued At" (Unix Timestamp in Sekunden)
      token_issued_at: decoded.iat ? new Date(decoded.iat * 1000) : null 
    };
  }
  return null;
}

const authMiddleware = (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: 'Server config error' });

    const decoded = jwt.verify(token, secret);
    const user = extractUserFromPayload(decoded);
    
    if (!user || !user.id) {
      return res.status(401).json({ message: 'Token invalid' });
    }
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid' });
  }
};

module.exports = authMiddleware;