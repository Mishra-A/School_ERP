const router = require('express').Router();
const c = require('../controllers/fees.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// Teachers have no access to fees at all.
router.get('/structures', requireRole('admin'), c.listStructures);
router.post('/structures', requireRole('admin'), c.createStructure);
router.put('/structures/:id', requireRole('admin'), c.updateStructure);
router.delete('/structures/:id', requireRole('admin'), c.deleteStructure);

router.get('/balances', requireRole('admin'), c.balances);
router.get('/payments', requireRole('admin'), c.listPayments);
router.post('/payments', requireRole('admin'), c.recordPayment);
router.post('/payments/:id/void', requireRole('admin'), c.voidPayment);

// Student-scoped: the service checks the user may see that student (and refuses teachers).
router.get('/payments/:id/receipt', requireRole('admin', 'student', 'parent'), c.receiptPdf);
router.get('/student/:id', requireRole('admin', 'student', 'parent'), c.studentFees);

module.exports = router;
