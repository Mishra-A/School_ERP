const AppError = require('../utils/AppError');
const { requireString, requireInt, optionalInt, requireDate } = require('../utils/validate');

function validateYear(b = {}) {
  const name = requireString(b.name, 'Year name', { max: 20 });
  const startDate = requireDate(b.startDate, 'Start date');
  const endDate = requireDate(b.endDate, 'End date');
  if (endDate <= startDate) throw new AppError('End date must be after the start date.', 422);
  return { name, startDate, endDate, isCurrent: b.isCurrent === true || b.isCurrent === 'true' || b.isCurrent === 1 };
}

const validateClass = (b = {}) => ({ name: requireString(b.name, 'Class name', { max: 40 }) });
const validateClassCreate = (b = {}) => ({ ...validateClass(b), academicYearId: requireInt(b.academicYearId, 'Academic year') });

const validateSection = (b = {}) => ({
  name: requireString(b.name, 'Section name', { max: 20 }),
  classTeacherId: optionalInt(b.classTeacherId, 'Class teacher'),
});
const validateSectionCreate = (b = {}) => ({ ...validateSection(b), classId: requireInt(b.classId, 'Class') });

const validateSubject = (b = {}) => ({
  name: requireString(b.name, 'Subject name', { max: 80 }),
  code: requireString(b.code, 'Subject code', { max: 20 }).toUpperCase(),
});

const validateAssignment = (b = {}) => ({
  sectionId: requireInt(b.sectionId, 'Section'),
  subjectId: requireInt(b.subjectId, 'Subject'),
  teacherId: requireInt(b.teacherId, 'Teacher'),
});

module.exports = { validateYear, validateClass, validateClassCreate, validateSection, validateSectionCreate, validateSubject, validateAssignment };
