const router = require('express').Router();
const { student: c } = require('../controllers/people.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', requireRole('admin', 'teacher'), c.list);
router.get('/mine', requireRole('student', 'parent'), c.mine);
// Any role may request a profile; students.service.getProfile enforces who can see which student.
router.get('/:id', c.get);
router.post('/', requireRole('admin'), c.create);
router.put('/:id', requireRole('admin'), c.update);
router.patch('/:id/status', requireRole('admin'), c.setStatus);
router.post('/:id/reset-password', requireRole('admin'), c.resetPassword);
router.post('/:id/parents', requireRole('admin'), c.linkParent);
router.delete('/:id/parents/:parentId', requireRole('admin'), c.unlinkParent);

module.exports = router;
