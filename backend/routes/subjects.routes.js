const router = require('express').Router();
const c = require('../controllers/academics.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', requireRole('admin', 'teacher'), c.listSubjects);
router.post('/', requireRole('admin'), c.createSubject);
router.put('/:id', requireRole('admin'), c.updateSubject);
router.delete('/:id', requireRole('admin'), c.deleteSubject);

module.exports = router;
