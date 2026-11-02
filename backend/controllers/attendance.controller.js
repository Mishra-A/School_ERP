const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseId } = require('../utils/validate');
const v = require('../validators/attendance.validator');
const svc = require('../services/attendance.service');
const { canViewStudent } = require('../services/access.service');

const roster = asyncHandler(async (req, res) => res.json(await svc.roster(req.user, v.validateRosterQuery(req.query))));
const save = asyncHandler(async (req, res) => res.json(await svc.saveBulk(req.user, v.validateBulk(req.body))));
const report = asyncHandler(async (req, res) => res.json(await svc.sectionReport(req.user, v.validateReportQuery(req.query))));

const forStudent = asyncHandler(async (req, res) => {
  const studentId = parseId(req.params.id);
  if (!(await canViewStudent(req.user, studentId))) throw new AppError("You don't have access to this student.", 403);
  res.json(await svc.summaryByStudent(req.user, studentId, v.validateRange(req.query)));
});

module.exports = { roster, save, report, forStudent };
