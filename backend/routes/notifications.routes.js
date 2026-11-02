const router = require('express').Router();
const c = require('../controllers/notifications.controller');
const { requireAuth } = require('../middleware/auth');

// Everyone, but only ever their own notifications.
router.use(requireAuth);
router.get('/', c.list);
router.get('/count', c.count);
router.post('/read-all', c.readAll);
router.post('/:id/read', c.read);

module.exports = router;
