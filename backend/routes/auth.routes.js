const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, passwordLimiter } = require('../middleware/security');

router.post('/login', loginLimiter, ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.post('/change-password', requireAuth, passwordLimiter, ctrl.changePassword);
router.patch('/preferences', requireAuth, ctrl.preferences);

module.exports = router;
