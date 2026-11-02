const asyncHandler = require('../utils/asyncHandler');
const { parseId, optionalInt, optionalDate, parsePaging } = require('../utils/validate');
const v = require('../validators/fees.validator');
const svc = require('../services/fees.service');
const receipt = require('../services/receipt.service');

const uid = (req) => req.user.id;
const ok = (res) => res.json({ ok: true });

const listStructures = asyncHandler(async (req, res) =>
  res.json({ structures: await svc.listStructures({ yearId: optionalInt(req.query.yearId, 'yearId'), classId: optionalInt(req.query.classId, 'classId') }) }));
const createStructure = asyncHandler(async (req, res) => res.status(201).json(await svc.createStructure(uid(req), v.validateStructureCreate(req.body))));
const updateStructure = asyncHandler(async (req, res) => { await svc.updateStructure(uid(req), parseId(req.params.id), v.validateStructure(req.body)); ok(res); });
const deleteStructure = asyncHandler(async (req, res) => { await svc.deleteStructure(uid(req), parseId(req.params.id)); ok(res); });

const studentFees = asyncHandler(async (req, res) => res.json(await svc.studentFees(req.user, parseId(req.params.id), optionalInt(req.query.yearId, 'yearId'))));

const balances = asyncHandler(async (req, res) =>
  res.json(await svc.studentBalances({
    ...parsePaging(req.query), search: String(req.query.search || '').trim().slice(0, 100),
    sectionId: optionalInt(req.query.sectionId, 'sectionId'), status: ['pending', 'paid'].includes(req.query.status) ? req.query.status : '',
  })));

const listPayments = asyncHandler(async (req, res) =>
  res.json(await svc.listPayments({
    ...parsePaging(req.query), search: String(req.query.search || '').trim().slice(0, 100),
    from: optionalDate(req.query.from, 'From date'), to: optionalDate(req.query.to, 'To date'),
  })));
const recordPayment = asyncHandler(async (req, res) => res.status(201).json(await svc.recordPayment(req.user, v.validatePayment(req.body))));
const voidPayment = asyncHandler(async (req, res) => { await svc.voidPayment(req.user, parseId(req.params.id), v.validateVoid(req.body)); ok(res); });

const receiptPdf = asyncHandler(async (req, res) => {
  const data = await svc.receiptData(req.user, parseId(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${String(data.receiptNo).replace(/[^\w-]+/g, '')}.pdf"`);
  const doc = receipt.render(data);
  doc.pipe(res);
  doc.end();
});

module.exports = { listStructures, createStructure, updateStructure, deleteStructure, studentFees, balances, listPayments, recordPayment, voidPayment, receiptPdf };
