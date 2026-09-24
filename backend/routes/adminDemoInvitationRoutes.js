const express = require('express');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/demoInvitationController');

const router = express.Router();
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `admin:${req.user.id}`,
  message: { message: 'Zu viele Demo-Einladungen. Bitte später erneut versuchen.' },
});
router.use(auth, (req, res, next) => req.user.role === 'admin'
  ? next()
  : res.status(403).json({ message: 'Nur Administratoren können Demo-Zugänge verwalten.' }));
router.param('id', (req, res, next, id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ? next()
  : res.status(400).json({ message: 'Ungültige Einladungs-ID.' }));
router.get('/', controller.list);
router.post('/', inviteLimiter, controller.create);
router.post('/:id/resend', inviteLimiter, controller.resend);
router.post('/:id/revoke', controller.revoke);

module.exports = router;
