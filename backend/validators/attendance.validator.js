const AppError = require('../utils/AppError');
const { requireInt, requireDate, optionalInt, oneOf, optionalDate } = require('../utils/validate');

const STATUSES = ['present', 'absent', 'late', 'leave'];

function validateRosterQuery(q = {}) {
  return { sectionId: requireInt(q.sectionId, 'Section'), subjectId: requireInt(q.subjectId, 'Subject'), date: requireDate(q.date, 'Date') };
}

function validateBulk(b = {}) {
  const base = validateRosterQuery(b);
  if (!Array.isArray(b.records) || b.records.length === 0) throw new AppError('Mark at least one student.', 422);
  if (b.records.length > 300) throw new AppError('Too many students in one request.', 422);
  const seen = new Set();
  const records = b.records.map((r) => {
    const studentId = requireInt(r && r.studentId, 'Student');
    if (seen.has(studentId)) throw new AppError('A student appears more than once.', 422);
    seen.add(studentId);
    return { studentId, status: oneOf(r.status, 'Status', STATUSES) };
  });
  return { ...base, records };
}

function validateRange(q = {}, { required = false } = {}) {
  const from = required ? requireDate(q.from, 'From date') : optionalDate(q.from, 'From date');
  const to = required ? requireDate(q.to, 'To date') : optionalDate(q.to, 'To date');
  if (from && to) {
    if (from > to) throw new AppError('The From date must be before the To date.', 422);
    if ((new Date(to) - new Date(from)) / 86400000 > 366) throw new AppError('Choose a range of one year or less.', 422);
  }
  return { from, to };
}

const validateReportQuery = (q = {}) => ({
  sectionId: requireInt(q.sectionId, 'Section'),
  subjectId: optionalInt(q.subjectId, 'Subject'),
  ...validateRange(q, { required: true }),
});

module.exports = { validateRosterQuery, validateBulk, validateRange, validateReportQuery, STATUSES };
