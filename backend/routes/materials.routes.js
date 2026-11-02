const router = require('express').Router();
const c = require('../controllers/classwork.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadOne } = require('../services/files.service');

router.use(requireAuth);
router.get('/', c.listMaterials);
router.post('/', requireRole('admin', 'teacher'), uploadOne({ required: true }), c.createMaterial);
router.get('/:id/file', c.materialFile);
router.delete('/:id', requireRole('admin', 'teacher'), c.deleteMaterial);

module.exports = router;
