const router = require('express').Router();
const c = require('../controllers/exams.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', c.listRemarks);
router.post('/', requireRole('teacher'), c.addRemark);
router.delete('/:id', requireRole('admin', 'teacher'), c.deleteRemark);

module.exports = router;
