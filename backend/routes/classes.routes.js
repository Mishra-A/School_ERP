const router = require('express').Router();
const c = require('../controllers/academics.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', requireRole('admin', 'teacher'), c.listClasses);
router.post('/', requireRole('admin'), c.createClass);
router.put('/:id', requireRole('admin'), c.updateClass);
router.delete('/:id', requireRole('admin'), c.deleteClass);

module.exports = router;
