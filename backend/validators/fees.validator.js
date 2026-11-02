const AppError = require('../utils/AppError');
const { requireString, requireInt, requireDate, requireNumber, oneOf, optionalString } = require('../utils/validate');

const METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

function validateStructure(b = {}) {
  return {
    feeType: requireString(b.feeType, 'Fee name', { max: 80 }),
    amount: requireNumber(b.amount, 'Amount', { min: 1, max: 10000000 }),
    dueDate: requireDate(b.dueDate, 'Due date'),
  };
}
const validateStructureCreate = (b = {}) => ({ ...validateStructure(b), classId: requireInt(b.classId, 'Class') });

function validatePayment(b = {}) {
  return {
    studentId: requireInt(b.studentId, 'Student'),
    feeStructureId: requireInt(b.feeStructureId, 'Fee'),
    amount: requireNumber(b.amount, 'Amount', { min: 0.01, max: 10000000 }),
    paidOn: requireDate(b.paidOn, 'Payment date'),
    method: oneOf(b.method || 'cash', 'Payment method', METHODS),
  };
}

function validateVoid(b = {}) {
  const reason = optionalString(b.reason, 'Reason', { max: 255 });
  if (!reason) throw new AppError('Give a reason for voiding this payment.', 422);
  return { reason };
}

module.exports = { validateStructure, validateStructureCreate, validatePayment, validateVoid, METHODS };
