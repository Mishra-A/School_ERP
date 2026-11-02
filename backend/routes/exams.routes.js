const router = require('express').Router();
const c = require('../controllers/exams.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', requireRole('admin', 'teacher'), c.listExams);
router.get('/mine', requireRole('student', 'parent'), c.examsForStudent);
router.post('/', requireRole('admin'), c.createExam);

router.put('/schedule/:id', requireRole('admin'), c.updateSchedule);
router.delete('/schedule/:id', requireRole('admin'), c.deleteSchedule);

router.get('/:id', c.getExam); // access checked per role in the service
router.put('/:id', requireRole('admin'), c.updateExam);
router.delete('/:id', requireRole('admin'), c.deleteExam);
router.post('/:id/schedule', requireRole('admin'), c.addSchedule);

module.exports = router;
