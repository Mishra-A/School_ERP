const asyncHandler = require('../utils/asyncHandler');
const { parseId, parsePaging } = require('../utils/validate');
const svc = require('../services/notifications.service');

const list = asyncHandler(async (req, res) => res.json(await svc.list(req.user, { ...parsePaging(req.query, { defaultLimit: 20, maxLimit: 50 }), unreadOnly: req.query.unread === '1' })));
const count = asyncHandler(async (req, res) => res.json({ unread: await svc.unreadCount(req.user) }));
const read = asyncHandler(async (req, res) => { await svc.markRead(req.user, parseId(req.params.id)); res.json({ ok: true }); });
const readAll = asyncHandler(async (req, res) => { await svc.markAllRead(req.user); res.json({ ok: true }); });

module.exports = { list, count, read, readAll };
