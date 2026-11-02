const AppError = require('../utils/AppError');
const { requireString, optionalString, requireInt, requireDate } = require('../utils/validate');

// Fields arrive as multipart text, so everything is a string here.
const validateAssignment = (b = {}) => ({
  title: requireString(b.title, 'Title', { max: 150 }),
  description: optionalString(b.description, 'Description', { max: 2000 }),
  dueDate: requireDate(b.dueDate, 'Due date'),
});
const validateAssignmentCreate = (b = {}) => ({ ...validateAssignment(b), classSubjectId: requireInt(b.classSubjectId, 'Subject') });

const validateMaterial = (b = {}) => ({
  title: requireString(b.title, 'Title', { max: 150 }),
  description: optionalString(b.description, 'Description', { max: 2000 }),
  classSubjectId: requireInt(b.classSubjectId, 'Subject'),
});

function validateFeedback(b = {}) {
  return { feedback: requireString(b.feedback, 'Feedback', { max: 1000 }) };
}

module.exports = { validateAssignment, validateAssignmentCreate, validateMaterial, validateFeedback };
