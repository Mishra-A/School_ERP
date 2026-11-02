const router = require('express').Router();
const c = require('../controllers/exams.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('admin', 'teacher'));
router.get('/options', c.marksOptions);
router.get('/sheet', c.marksSheet);
router.post('/bulk', c.marksSave);

module.exports = router;
