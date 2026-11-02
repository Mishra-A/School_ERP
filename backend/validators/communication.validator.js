const AppError = require('../utils/AppError');
const { requireString, optionalString, optionalInt, optionalDate, oneOf, requireDate } = require('../utils/validate');

const AUDIENCES = ['all', 'teachers', 'students', 'parents'];
const EVENT_TYPES = ['exam', 'sports_day', 'annual_function', 'ptm', 'holiday', 'other'];

// Notices arrive as multipart text fields.
function validateNotice(b = {}) {
  return {
    title: requireString(b.title, 'Title', { max: 150 }),
    description: requireString(b.description, 'Message', { max: 5000 }),
    audience: oneOf(b.audience || 'all', 'Audience', AUDIENCES),
    classId: optionalInt(b.classId, 'Class'),
    publishDate: optionalDate(b.publishDate, 'Publish date'),
  };
}

function validateEvent(b = {}) {
  const startDate = requireDate(b.startDate, 'Start date');
  const endDate = optionalDate(b.endDate, 'End date');
  if (endDate && endDate < startDate) throw new AppError('The end date must not be before the start date.', 422);
  return {
    title: requireString(b.title, 'Title', { max: 150 }),
    description: optionalString(b.description, 'Description', { max: 2000 }),
    eventType: oneOf(b.eventType || 'other', 'Type', EVENT_TYPES),
    startDate, endDate,
  };
}

module.exports = { validateNotice, validateEvent, AUDIENCES, EVENT_TYPES };
