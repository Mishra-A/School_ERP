const router = require('express').Router();
const c = require('../controllers/academics.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/options', requireRole('admin', 'teacher'), c.sectionOptions);
router.post('/', requireRole('admin'), c.createSection);
router.put('/:id', requireRole('admin'), c.updateSection);
router.delete('/:id', requireRole('admin'), c.deleteSection);

module.exports = router;
