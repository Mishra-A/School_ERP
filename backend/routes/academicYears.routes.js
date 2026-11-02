const router = require('express').Router();
const c = require('../controllers/academics.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('admin'));
router.get('/', c.listYears);
router.post('/', c.createYear);
router.put('/:id', c.updateYear);
router.post('/:id/set-current', c.setCurrentYear);

module.exports = router;
