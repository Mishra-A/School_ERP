const router = require('express').Router();
const ctrl = require('../controllers/reports.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
// Every role gets its own dashboard payload; the service decides what each role may see.
router.get('/dashboard', ctrl.dashboard);

router.get('/fees', requireRole('admin'), ctrl.fees);
router.get('/attendance', requireRole('admin'), ctrl.attendance);
router.get('/enrollment', requireRole('admin'), ctrl.enrollment);
router.get('/exam/:examId', requireRole('admin'), ctrl.exam);

module.exports = router;
