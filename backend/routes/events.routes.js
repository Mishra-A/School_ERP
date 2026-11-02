const router = require('express').Router();
const c = require('../controllers/communication.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', c.listEvents);
router.post('/', requireRole('admin'), c.createEvent);
router.put('/:id', requireRole('admin'), c.updateEvent);
router.delete('/:id', requireRole('admin'), c.deleteEvent);

module.exports = router;
