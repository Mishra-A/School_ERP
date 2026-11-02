const asyncHandler = require('../utils/asyncHandler');
const { parseId } = require('../utils/validate');
const { validateEntry } = require('../validators/timetable.validator');
const svc = require('../services/timetable.service');

const forSection = asyncHandler(async (req, res) => res.json({ entries: await svc.forSection(req.user, parseId(req.params.sectionId)) }));
const mine = asyncHandler(async (req, res) => res.json({ views: await svc.mine(req.user) }));
const create = asyncHandler(async (req, res) => res.status(201).json(await svc.create(req.user.id, validateEntry(req.body))));
const update = asyncHandler(async (req, res) => { await svc.update(req.user.id, parseId(req.params.id), validateEntry(req.body)); res.json({ ok: true }); });
const remove = asyncHandler(async (req, res) => { await svc.remove(req.user.id, parseId(req.params.id)); res.json({ ok: true }); });

module.exports = { forSection, mine, create, update, remove };
