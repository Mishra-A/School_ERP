const router = require('express').Router();
const c = require('../controllers/classwork.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadOne } = require('../services/files.service');

const staff = requireRole('admin', 'teacher');
router.use(requireAuth);

// Role checks always come before uploadOne, so unauthorised users can't write files to disk.
router.get('/', c.listAssignments);
router.post('/', staff, uploadOne(), c.createAssignment);

router.get('/submissions/:id/file', c.submissionFile);
router.put('/submissions/:id/review', staff, c.review);

router.get('/:id', c.getAssignment);
router.put('/:id', staff, uploadOne(), c.updateAssignment);
router.delete('/:id', staff, c.deleteAssignment);
router.get('/:id/file', c.assignmentFile);
router.get('/:id/submissions', staff, c.listSubmissions);
router.post('/:id/submit', requireRole('student'), uploadOne({ required: true }), c.submit);

module.exports = router;
