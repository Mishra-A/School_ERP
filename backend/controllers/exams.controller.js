const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseId, optionalInt } = require('../utils/validate');
const v = require('../validators/exams.validator');
const exams = require('../services/exams.service');
const marks = require('../services/marks.service');
const results = require('../services/results.service');
const remarks = require('../services/remarks.service');
const grades = require('../services/grades.service');
const reportCard = require('../services/reportcard.service');

const ok = (res) => res.json({ ok: true });
const uid = (req) => req.user.id;

// ---- exams
const listExams = asyncHandler(async (req, res) => res.json({ exams: await exams.list(req.user, { yearId: optionalInt(req.query.yearId, 'yearId') }) }));
const examsForStudent = asyncHandler(async (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.profileId : optionalInt(req.query.studentId, 'studentId');
  if (!studentId) throw new AppError('Choose a child first.', 422);
  res.json({ exams: await exams.forStudent(req.user, studentId) });
});
const getExam = asyncHandler(async (req, res) => res.json(await exams.get(req.user, parseId(req.params.id))));
const createExam = asyncHandler(async (req, res) => res.status(201).json(await exams.create(uid(req), v.validateExamCreate(req.body))));
const updateExam = asyncHandler(async (req, res) => { await exams.update(uid(req), parseId(req.params.id), v.validateExam(req.body)); ok(res); });
const deleteExam = asyncHandler(async (req, res) => { await exams.remove(uid(req), parseId(req.params.id)); ok(res); });
const addSchedule = asyncHandler(async (req, res) => res.status(201).json(await exams.addSchedule(uid(req), parseId(req.params.id), v.validateScheduleCreate(req.body))));
const updateSchedule = asyncHandler(async (req, res) => { await exams.updateSchedule(uid(req), parseId(req.params.id), v.validateSchedule(req.body)); ok(res); });
const deleteSchedule = asyncHandler(async (req, res) => { await exams.removeSchedule(uid(req), parseId(req.params.id)); ok(res); });

// ---- marks entry
const marksOptions = asyncHandler(async (req, res) => res.json({ options: await marks.options(req.user) }));
const marksSheet = asyncHandler(async (req, res) => res.json(await marks.sheet(req.user, v.validateMarksQuery(req.query))));
const marksSave = asyncHandler(async (req, res) => res.json(await marks.save(req.user, v.validateMarksBulk(req.body))));

// ---- results
const resultHistory = asyncHandler(async (req, res) => res.json({ exams: await results.history(req.user, parseId(req.params.id)) }));
const resultDetail = asyncHandler(async (req, res) => res.json(await results.detail(req.user, parseId(req.params.id), parseId(req.params.examId))));
const classSheet = asyncHandler(async (req, res) => res.json(await results.classSheet(req.user, parseId(req.params.examId), parseId(req.query.sectionId, 'sectionId'))));
const reportCardPdf = asyncHandler(async (req, res) => {
  const data = await reportCard.prepare(req.user, parseId(req.params.id), parseId(req.params.examId));
  const safe = String(data.info.admissionNo).replace(/[^\w-]+/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-card-${safe || data.info.studentId}-exam${data.info.examId}.pdf"`);
  const doc = reportCard.render(data);
  doc.pipe(res);
  doc.end();
});

// ---- remarks
const listRemarks = asyncHandler(async (req, res) => res.json({ remarks: await remarks.list(req.user, parseId(req.query.studentId, 'studentId')) }));
const addRemark = asyncHandler(async (req, res) => res.status(201).json(await remarks.create(req.user, v.validateRemark(req.body))));
const deleteRemark = asyncHandler(async (req, res) => { await remarks.remove(req.user, parseId(req.params.id)); ok(res); });

// ---- grade scale
const getGrades = asyncHandler(async (req, res) => res.json({ grades: await grades.getScale() }));
const saveGrades = asyncHandler(async (req, res) => { await grades.saveScale(uid(req), v.validateGradeScale(req.body)); ok(res); });

module.exports = {
  listExams, examsForStudent, getExam, createExam, updateExam, deleteExam, addSchedule, updateSchedule, deleteSchedule,
  marksOptions, marksSheet, marksSave, resultHistory, resultDetail, classSheet, reportCardPdf,
  listRemarks, addRemark, deleteRemark, getGrades, saveGrades,
};
