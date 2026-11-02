const router = require('express').Router();
const c = require('../controllers/communication.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadOne } = require('../services/files.service');

const writers = requireRole('admin', 'teacher');
router.use(requireAuth);
router.get('/', c.listNotices);
router.get('/classes', writers, c.noticeClasses);
router.post('/', writers, uploadOne(), c.createNotice);
router.put('/:id', writers, uploadOne(), c.updateNotice);
router.delete('/:id', writers, c.deleteNotice);
router.get('/:id/attachment', c.noticeFile);

module.exports = router;
