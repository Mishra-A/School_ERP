const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseId, requireInt } = require('../utils/validate');
const v = require('../validators/academics.validator');
const svc = require('../services/academics.service');

const uid = (req) => req.user.id;
const created = (res, data) => res.status(201).json(data);
const ok = (res) => res.json({ ok: true });

// Academic years
const listYears = asyncHandler(async (req, res) => res.json({ years: await svc.listYears() }));
const createYear = asyncHandler(async (req, res) => created(res, await svc.createYear(uid(req), v.validateYear(req.body))));
const updateYear = asyncHandler(async (req, res) => { await svc.updateYear(uid(req), parseId(req.params.id), v.validateYear(req.body)); ok(res); });
const setCurrentYear = asyncHandler(async (req, res) => { await svc.setCurrentYear(uid(req), parseId(req.params.id)); ok(res); });

// Classes
const listClasses = asyncHandler(async (req, res) => {
  if (!req.query.yearId) throw new AppError('yearId is required.', 422);
  res.json({ classes: await svc.listClasses(requireInt(req.query.yearId, 'yearId')) });
});
const createClass = asyncHandler(async (req, res) => created(res, await svc.createClass(uid(req), v.validateClassCreate(req.body))));
const updateClass = asyncHandler(async (req, res) => { await svc.updateClass(uid(req), parseId(req.params.id), v.validateClass(req.body)); ok(res); });
const deleteClass = asyncHandler(async (req, res) => { await svc.deleteClass(uid(req), parseId(req.params.id)); ok(res); });

// Sections
const sectionOptions = asyncHandler(async (req, res) => res.json({ sections: await svc.sectionOptions() }));
const createSection = asyncHandler(async (req, res) => created(res, await svc.createSection(uid(req), v.validateSectionCreate(req.body))));
const updateSection = asyncHandler(async (req, res) => { await svc.updateSection(uid(req), parseId(req.params.id), v.validateSection(req.body)); ok(res); });
const deleteSection = asyncHandler(async (req, res) => { await svc.deleteSection(uid(req), parseId(req.params.id)); ok(res); });

// Subjects
const listSubjects = asyncHandler(async (req, res) => res.json({ subjects: await svc.listSubjects() }));
const createSubject = asyncHandler(async (req, res) => created(res, await svc.createSubject(uid(req), v.validateSubject(req.body))));
const updateSubject = asyncHandler(async (req, res) => { await svc.updateSubject(uid(req), parseId(req.params.id), v.validateSubject(req.body)); ok(res); });
const deleteSubject = asyncHandler(async (req, res) => { await svc.deleteSubject(uid(req), parseId(req.params.id)); ok(res); });

// Teaching assignments
const teachingOptions = asyncHandler(async (req, res) => res.json({ options: await svc.teachingOptions(req.user) }));
const listAssignments = asyncHandler(async (req, res) => res.json({ assignments: await svc.listAssignments(requireInt(req.query.sectionId, 'sectionId')) }));
const createAssignment = asyncHandler(async (req, res) => created(res, await svc.createAssignment(uid(req), v.validateAssignment(req.body))));
const changeAssignmentTeacher = asyncHandler(async (req, res) => {
  await svc.changeAssignmentTeacher(uid(req), parseId(req.params.id), requireInt(req.body.teacherId, 'Teacher'));
  ok(res);
});
const deleteAssignment = asyncHandler(async (req, res) => { await svc.deleteAssignment(uid(req), parseId(req.params.id)); ok(res); });

module.exports = {
  teachingOptions,
  listYears, createYear, updateYear, setCurrentYear,
  listClasses, createClass, updateClass, deleteClass,
  sectionOptions, createSection, updateSection, deleteSection,
  listSubjects, createSubject, updateSubject, deleteSubject,
  listAssignments, createAssignment, changeAssignmentTeacher, deleteAssignment,
};
