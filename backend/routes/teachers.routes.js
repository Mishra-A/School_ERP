const router = require('express').Router();
const { teacher: c } = require('../controllers/people.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('admin'));
router.get('/', c.list);
router.get('/options', c.options);
router.get('/:id', c.get);
router.post('/', c.create);
router.put('/:id', c.update);
router.patch('/:id/status', c.setStatus);
router.post('/:id/reset-password', c.resetPassword);

module.exports = router;
