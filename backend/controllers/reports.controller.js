const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parseId, requireDate } = require('../utils/validate');
const dashboardService = require('../services/dashboard.service');
const reports = require('../services/reports.service');

const dashboard = asyncHandler(async (req, res) => {
  const allowedWindows = [7, 30, 90];
  const windowDays = req.user.role === 'admin' && req.query.window !== undefined
    ? Number(req.query.window)
    : 7;
  if (req.user.role === 'admin' && !allowedWindows.includes(windowDays)) {
    throw new AppError('Choose a dashboard window of 7, 30, or 90 days.', 422);
  }
  const data = await dashboardService.getDashboard(req.user, windowDays);
  res.json(data);
});

function range(q) {
  const from = requireDate(q.from, 'From date');
  const to = requireDate(q.to, 'To date');
  if (from > to) throw new AppError('The From date must be before the To date.', 422);
  if ((new Date(to) - new Date(from)) / 86400000 > 366) throw new AppError('Choose a range of one year or less.', 422);
  return { from, to };
}

const fees = asyncHandler(async (req, res) => res.json(await reports.feeReport(range(req.query))));
const attendance = asyncHandler(async (req, res) => res.json(await reports.attendanceReport(range(req.query))));
const enrollment = asyncHandler(async (req, res) => res.json(await reports.enrollmentReport()));
const exam = asyncHandler(async (req, res) => res.json(await reports.examReport(req.user, parseId(req.params.examId))));

module.exports = { dashboard, fees, attendance, enrollment, exam };
