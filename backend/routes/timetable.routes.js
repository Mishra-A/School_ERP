const router = require('express').Router();
const c = require('../controllers/timetable.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/mine', requireRole('teacher', 'student', 'parent'), c.mine);
router.get('/section/:sectionId', c.forSection); // access checked per role in the service
router.post('/', requireRole('admin'), c.create);
router.put('/:id', requireRole('admin'), c.update);
router.delete('/:id', requireRole('admin'), c.remove);

module.exports = router;
