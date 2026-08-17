// backend/middleware/authorize.js
const authMiddleware = require('./authMiddleware');

module.exports = (allowedRoles = []) => {
  const allowed = allowedRoles.map((role) => String(role).toLowerCase());
  return (req, res, next) => authMiddleware(req, res, () => {
    if (allowed.length > 0 && !allowed.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Zugriff verweigert. Rolle nicht ausreichend.' });
    }
    return next();
  });
};
