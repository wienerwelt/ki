const adminAuth = require('./adminAuth');

module.exports = (req, res, next) => adminAuth(req, res, next);
