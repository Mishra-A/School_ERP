const AppError = require('../utils/AppError');
const { requireInt, optionalString } = require('../utils/validate');

const time = (value, field) => {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new AppError(`${field} must be a time like 09:30.`, 422);
  return value;
};

function validateEntry(b = {}) {
  const day = requireInt(b.dayOfWeek, 'Day');
  if (day > 7) throw new AppError('Day must be between Monday and Sunday.', 422);
  const periodNo = requireInt(b.periodNo, 'Period');
  if (periodNo > 15) throw new AppError('Period number must be 15 or less.', 422);
  const startTime = time(b.startTime, 'Start time');
  const endTime = time(b.endTime, 'End time');
  if (endTime <= startTime) throw new AppError('End time must be after the start time.', 422);
  return {
    classSubjectId: requireInt(b.classSubjectId, 'Subject'),
    dayOfWeek: day, periodNo, startTime, endTime,
    room: optionalString(b.room, 'Room', { max: 30 }),
  };
}

module.exports = { validateEntry };
