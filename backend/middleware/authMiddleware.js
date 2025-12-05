// backend/middleware/authMiddleware.js
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
    const userData = (decoded.user && typeof decoded.user === 'object') ? decoded.user : decoded;
    
    return {
      id: userData.id || userData.userId || userData.sub,
      role: userData.role,
      email: userData.email,
      username: userData.username,
      business_partner_id: userData.business_partner_id || null,
      contribution_score: userData.contribution_score ?? 0,
      // NEU: Wir merken uns, wann der Token erstellt wurde (Login-Zeitpunkt)
      token_issued_at: decoded.iat ? new Date(decoded.iat * 1000) : new Date(0)
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
    if (!secret) {
      return res.status(500).json({ message: 'Server misconfigured: JWT_SECRET missing' });
    }
    const decoded = jwt.verify(token, secret);
    const user = extractUserFromPayload(decoded);
    
    if (!user || (!user.id && !user.email)) {
      return res.status(401).json({ message: 'Token is not valid (no user info)' });
    }
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = authMiddleware;