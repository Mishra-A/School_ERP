const AppError = require('../utils/AppError');
const { requireString, requireInt, optionalDate, requireDate, optionalTime, requireNumber, optionalString } = require('../utils/validate');

function validateExam(b = {}) {
  const startDate = optionalDate(b.startDate, 'Start date');
  const endDate = optionalDate(b.endDate, 'End date');
  if (startDate && endDate && endDate < startDate) throw new AppError('The end date must not be before the start date.', 422);
  return { name: requireString(b.name, 'Exam name', { max: 100 }), startDate, endDate };
}
const validateExamCreate = (b = {}) => ({ ...validateExam(b), classId: requireInt(b.classId, 'Class') });

function validateSchedule(b = {}) {
  const maxMarks = requireNumber(b.maxMarks, 'Maximum marks', { min: 1, max: 1000 });
  const passMarks = requireNumber(b.passMarks, 'Pass marks', { min: 0, max: maxMarks });
  return { examDate: requireDate(b.examDate, 'Exam date'), startTime: optionalTime(b.startTime, 'Start time'), maxMarks, passMarks };
}
const validateScheduleCreate = (b = {}) => ({ ...validateSchedule(b), subjectId: requireInt(b.subjectId, 'Subject') });

function validateMarksQuery(q = {}) {
  return { examScheduleId: requireInt(q.examScheduleId, 'Exam subject'), sectionId: requireInt(q.sectionId, 'Section') };
}

function validateMarksBulk(b = {}) {
  const base = validateMarksQuery(b);
  if (!Array.isArray(b.records) || b.records.length === 0) throw new AppError('Enter marks for at least one student.', 422);
  if (b.records.length > 300) throw new AppError('Too many students in one request.', 422);
  const seen = new Set();
  const records = b.records.map((r) => {
    const studentId = requireInt(r && r.studentId, 'Student');
    if (seen.has(studentId)) throw new AppError('A student appears more than once.', 422);
    seen.add(studentId);
    const absent = r.absent === true;
    const blank = r.marks === null || r.marks === undefined || r.marks === '';
    // Marks are validated against the exam's maximum in the service, where that maximum is known.
    return { studentId, absent, marks: absent || blank ? null : requireNumber(r.marks, 'Marks', { min: 0, max: 1000 }) };
  });
  return { ...base, records };
}

function validateRemark(b = {}) {
  return { studentId: requireInt(b.studentId, 'Student'), remark: requireString(b.remark, 'Remark', { max: 500 }) };
}

function validateGradeScale(b = {}) {
  if (!Array.isArray(b.grades) || b.grades.length < 2 || b.grades.length > 15) throw new AppError('Enter between 2 and 15 grades.', 422);
  const names = new Set();
  const grades = b.grades.map((g) => {
    const grade = requireString(g && g.grade, 'Grade', { max: 5 });
    if (names.has(grade.toUpperCase())) throw new AppError(`The grade "${grade}" appears twice.`, 422);
    names.add(grade.toUpperCase());
    return { grade, minPercent: requireNumber(g.minPercent, 'Minimum percentage', { min: 0, max: 100 }) };
  });
  if (!grades.some((g) => g.minPercent === 0)) throw new AppError('The lowest grade must start at 0%, so every score gets a grade.', 422);
  if (new Set(grades.map((g) => g.minPercent)).size !== grades.length) throw new AppError('Two grades have the same starting percentage.', 422);
  return { grades };
}

module.exports = { validateExam, validateExamCreate, validateSchedule, validateScheduleCreate, validateMarksQuery, validateMarksBulk, validateRemark, validateGradeScale, optionalString };
