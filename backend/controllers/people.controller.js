const asyncHandler = require('../utils/asyncHandler');
const { parseId, parsePaging, optionalInt } = require('../utils/validate');
const v = require('../validators/people.validator');
const people = require('../services/people.service');
const teachers = require('../services/teachers.service');
const parents = require('../services/parents.service');
const students = require('../services/students.service');

const uid = (req) => req.user.id;
const ok = (res) => res.json({ ok: true });
const listQuery = (req) => ({
  ...parsePaging(req.query),
  search: String(req.query.search || '').trim().slice(0, 100),
  status: req.query.status,
});

// Teachers
const teacher = {
  list: asyncHandler(async (req, res) => res.json(await teachers.list(listQuery(req)))),
  options: asyncHandler(async (req, res) => res.json({ teachers: await teachers.options() })),
  get: asyncHandler(async (req, res) => res.json({ teacher: await teachers.get(parseId(req.params.id)) })),
  create: asyncHandler(async (req, res) => res.status(201).json(await teachers.create(uid(req), v.validateTeacher(req.body)))),
  update: asyncHandler(async (req, res) => { await teachers.update(uid(req), parseId(req.params.id), v.validateTeacher(req.body)); ok(res); }),
  setStatus: asyncHandler(async (req, res) => { await people.setActive(uid(req), 'teacher', parseId(req.params.id), v.validateActive(req.body)); ok(res); }),
  resetPassword: asyncHandler(async (req, res) => res.json(await people.resetPassword(uid(req), 'teacher', parseId(req.params.id)))),
};

// Parents
const parent = {
  list: asyncHandler(async (req, res) => res.json(await parents.list(listQuery(req)))),
  options: asyncHandler(async (req, res) => res.json({ parents: await parents.options() })),
  get: asyncHandler(async (req, res) => res.json({ parent: await parents.get(parseId(req.params.id)) })),
  create: asyncHandler(async (req, res) => res.status(201).json(await parents.create(uid(req), v.validateParent(req.body)))),
  update: asyncHandler(async (req, res) => { await parents.update(uid(req), parseId(req.params.id), v.validateParent(req.body)); ok(res); }),
  setStatus: asyncHandler(async (req, res) => { await people.setActive(uid(req), 'parent', parseId(req.params.id), v.validateActive(req.body)); ok(res); }),
  resetPassword: asyncHandler(async (req, res) => res.json(await people.resetPassword(uid(req), 'parent', parseId(req.params.id)))),
};

// Students
const student = {
  mine: asyncHandler(async (req, res) => res.json({ students: await students.myStudents(req.user) })),
  list: asyncHandler(async (req, res) =>
    res.json(await students.list(req.user, { ...listQuery(req), sectionId: optionalInt(req.query.sectionId, 'sectionId') }))),
  get: asyncHandler(async (req, res) => res.json(await students.getProfile(req.user, parseId(req.params.id)))),
  create: asyncHandler(async (req, res) => res.status(201).json(await students.create(uid(req), v.validateStudent(req.body)))),
  update: asyncHandler(async (req, res) => { await students.update(uid(req), parseId(req.params.id), v.validateStudent(req.body)); ok(res); }),
  setStatus: asyncHandler(async (req, res) => { await people.setActive(uid(req), 'student', parseId(req.params.id), v.validateActive(req.body)); ok(res); }),
  resetPassword: asyncHandler(async (req, res) => res.json(await people.resetPassword(uid(req), 'student', parseId(req.params.id)))),
  linkParent: asyncHandler(async (req, res) => { await students.linkParent(uid(req), parseId(req.params.id), v.validateParentLink(req.body)); ok(res); }),
  unlinkParent: asyncHandler(async (req, res) => { await students.unlinkParent(uid(req), parseId(req.params.id), parseId(req.params.parentId)); ok(res); }),
};

module.exports = { teacher, parent, student };
