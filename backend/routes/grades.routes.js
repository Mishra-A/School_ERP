const router = require('express').Router();
const c = require('../controllers/exams.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', c.getGrades);
router.put('/', requireRole('admin'), c.saveGrades);

module.exports = router;
