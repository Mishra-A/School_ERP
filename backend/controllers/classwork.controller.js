const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseId, optionalInt } = require('../utils/validate');
const v = require('../validators/classwork.validator');
const svc = require('../services/classwork.service');
const files = require('../services/files.service');

// If anything fails after a file was uploaded, delete it so orphan files don't pile up.
const withCleanup = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (req.file) files.remove(req.file.filename);
    throw err;
  }
});

const ok = (res) => res.json({ ok: true });

// ---- assignments
const listAssignments = asyncHandler(async (req, res) => {
  if (req.user.role === 'student' || req.user.role === 'parent') {
    const studentId = req.user.role === 'student' ? req.user.profileId : optionalInt(req.query.studentId, 'studentId');
    if (!studentId) throw new AppError('Choose a child first.', 422);
    return res.json({ assignments: await svc.listForStudent(req.user, studentId) });
  }
  res.json({ assignments: await svc.listForStaff(req.user, { classSubjectId: optionalInt(req.query.classSubjectId, 'classSubjectId') }) });
});
const getAssignment = asyncHandler(async (req, res) => res.json({ assignment: await svc.assignmentDetail(req.user, parseId(req.params.id)) }));
const createAssignment = withCleanup(async (req, res) => res.status(201).json(await svc.createAssignment(req.user, v.validateAssignmentCreate(req.body), req.file)));
const updateAssignment = withCleanup(async (req, res) => { await svc.updateAssignment(req.user, parseId(req.params.id), v.validateAssignment(req.body), req.file); ok(res); });
const deleteAssignment = asyncHandler(async (req, res) => { await svc.deleteAssignment(req.user, parseId(req.params.id)); ok(res); });
const assignmentFile = asyncHandler(async (req, res) => {
  const f = await svc.assignmentFile(req.user, parseId(req.params.id));
  files.sendDownload(res, f.stored, f.title);
});

// ---- submissions
const listSubmissions = asyncHandler(async (req, res) => res.json(await svc.listSubmissions(req.user, parseId(req.params.id))));
const submit = withCleanup(async (req, res) => { await svc.submit(req.user, parseId(req.params.id), req.file); ok(res); });
const submissionFile = asyncHandler(async (req, res) => {
  const f = await svc.submissionFile(req.user, parseId(req.params.id));
  files.sendDownload(res, f.stored, f.title);
});
const review = asyncHandler(async (req, res) => { await svc.review(req.user, parseId(req.params.id), v.validateFeedback(req.body)); ok(res); });

// ---- materials
const listMaterials = asyncHandler(async (req, res) =>
  res.json({ materials: await svc.listMaterials(req.user, { classSubjectId: optionalInt(req.query.classSubjectId, 'classSubjectId'), studentId: optionalInt(req.query.studentId, 'studentId') }) }));
const createMaterial = withCleanup(async (req, res) => res.status(201).json(await svc.createMaterial(req.user, v.validateMaterial(req.body), req.file)));
const deleteMaterial = asyncHandler(async (req, res) => { await svc.deleteMaterial(req.user, parseId(req.params.id)); ok(res); });
const materialFile = asyncHandler(async (req, res) => {
  const f = await svc.materialFile(req.user, parseId(req.params.id));
  files.sendDownload(res, f.stored, f.title);
});

module.exports = {
  listAssignments, getAssignment, createAssignment, updateAssignment, deleteAssignment, assignmentFile,
  listSubmissions, submit, submissionFile, review,
  listMaterials, createMaterial, deleteMaterial, materialFile,
};
