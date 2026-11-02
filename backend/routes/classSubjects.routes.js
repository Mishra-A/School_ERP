const router = require('express').Router();
const c = require('../controllers/academics.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/mine', requireRole('admin', 'teacher'), c.teachingOptions);
router.get('/', requireRole('admin'), c.listAssignments);
router.post('/', requireRole('admin'), c.createAssignment);
router.put('/:id', requireRole('admin'), c.changeAssignmentTeacher);
router.delete('/:id', requireRole('admin'), c.deleteAssignment);

module.exports = router;
