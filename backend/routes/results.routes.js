const router = require('express').Router();
const c = require('../controllers/exams.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/exam/:examId', requireRole('admin', 'teacher'), c.classSheet);
// Student-scoped routes are open to every role; the service checks the user may see that particular student.
router.get('/student/:id', c.resultHistory);
router.get('/student/:id/exam/:examId', c.resultDetail);
router.get('/student/:id/exam/:examId/report-card', c.reportCardPdf);

module.exports = router;
