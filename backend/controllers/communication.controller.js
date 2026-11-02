const asyncHandler = require('../utils/asyncHandler');
const { parseId, parsePaging } = require('../utils/validate');
const v = require('../validators/communication.validator');
const notices = require('../services/notices.service');
const events = require('../services/events.service');
const files = require('../services/files.service');

const ok = (res) => res.json({ ok: true });

// A failed request must not leave its uploaded file behind.
const withCleanup = (fn) => asyncHandler(async (req, res, next) => {
  try { await fn(req, res, next); } catch (err) { if (req.file) files.remove(req.file.filename); throw err; }
});

const listNotices = asyncHandler(async (req, res) => res.json(await notices.list(req.user, parsePaging(req.query, { defaultLimit: 15, maxLimit: 50 }))));
const noticeClasses = asyncHandler(async (req, res) => res.json({ classes: await notices.targetClasses(req.user) }));
const createNotice = withCleanup(async (req, res) => res.status(201).json(await notices.create(req.user, v.validateNotice(req.body), req.file)));
const updateNotice = withCleanup(async (req, res) => { await notices.update(req.user, parseId(req.params.id), v.validateNotice(req.body), req.file); ok(res); });
const deleteNotice = asyncHandler(async (req, res) => { await notices.remove(req.user, parseId(req.params.id)); ok(res); });
const noticeFile = asyncHandler(async (req, res) => {
  const f = await notices.attachment(req.user, parseId(req.params.id));
  files.sendDownload(res, f.stored, f.title);
});

const listEvents = asyncHandler(async (req, res) =>
  res.json({ events: await events.list({ scope: req.query.scope === 'past' ? 'past' : 'upcoming', type: v.EVENT_TYPES.includes(req.query.type) ? req.query.type : '' }) }));
const createEvent = asyncHandler(async (req, res) => res.status(201).json(await events.create(req.user.id, v.validateEvent(req.body))));
const updateEvent = asyncHandler(async (req, res) => { await events.update(req.user.id, parseId(req.params.id), v.validateEvent(req.body)); ok(res); });
const deleteEvent = asyncHandler(async (req, res) => { await events.remove(req.user.id, parseId(req.params.id)); ok(res); });

module.exports = { listNotices, noticeClasses, createNotice, updateNotice, deleteNotice, noticeFile, listEvents, createEvent, updateEvent, deleteEvent };
