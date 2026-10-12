const express = require('express');
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/platformUpdateController');

const router = express.Router();
router.use(auth, (req, res, next) => req.user.role === 'admin'
  ? next()
  : res.status(403).json({ message: 'Nur Administratoren können Plattform-Updates verwalten.' }));
router.param('id', (req, res, next, id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ? next()
  : res.status(400).json({ message: 'Ungültige Update-ID.' }));

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
