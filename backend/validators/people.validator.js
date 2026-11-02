const AppError = require('../utils/AppError');
const { requireString, requireEmail, optionalString, optionalPhone, optionalDate, optionalInt, requireInt, oneOf } = require('../utils/validate');

const base = (b) => ({ name: requireString(b.name, 'Name', { max: 120 }), email: requireEmail(b.email), phone: optionalPhone(b.phone) });

function validateTeacher(b = {}) {
  return {
    ...base(b),
    employeeCode: requireString(b.employeeCode, 'Employee code', { max: 30 }),
    qualification: optionalString(b.qualification, 'Qualification', { max: 150 }),
    joinedOn: optionalDate(b.joinedOn, 'Joining date'),
  };
}

function validateParent(b = {}) {
  return { ...base(b), occupation: optionalString(b.occupation, 'Occupation', { max: 100 }) };
}

function validateStudent(b = {}) {
  const dob = optionalDate(b.dob, 'Date of birth');
  if (dob && dob > new Date().toISOString().slice(0, 10)) throw new AppError('Date of birth cannot be in the future.', 422);
  const gender = b.gender ? oneOf(b.gender, 'Gender', ['male', 'female', 'other']) : null;
  return {
    ...base(b),
    admissionNo: requireString(b.admissionNo, 'Admission number', { max: 30 }),
    dob,
    gender,
    address: optionalString(b.address, 'Address', { max: 255 }),
    sectionId: optionalInt(b.sectionId, 'Section'),
    rollNo: optionalInt(b.rollNo, 'Roll number'),
  };
}

function validateParentLink(b = {}) {
  return {
    parentId: requireInt(b.parentId, 'Parent'),
    relation: oneOf(b.relation || 'guardian', 'Relation', ['father', 'mother', 'guardian', 'other']),
  };
}

function validateActive(b = {}) {
  if (typeof b.active !== 'boolean') throw new AppError('active must be true or false.', 422);
  return b.active;
}

module.exports = { validateTeacher, validateParent, validateStudent, validateParentLink, validateActive };
