const authMiddleware = require('./authMiddleware');

module.exports = (req, res, next) => authMiddleware(req, res, () => {
  if (!['admin', 'assistenz'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Zugriff nur für Administration oder Mandantenassistenz.' });
  }
  if (req.user.role === 'assistenz' && !req.user.business_partner_id) {
    return res.status(403).json({ message: 'Der Mandantenassistenz ist kein Mandant zugeordnet.' });
  }
  return next();
});
