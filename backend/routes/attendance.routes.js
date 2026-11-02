const router = require('express').Router();
const c = require('../controllers/attendance.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/roster', requireRole('admin', 'teacher'), c.roster);
router.post('/bulk', requireRole('admin', 'teacher'), c.save);
router.get('/report', requireRole('admin', 'teacher'), c.report);
// Any role; the controller checks the user may see this particular student.
router.get('/student/:id', c.forStudent);

module.exports = router;
