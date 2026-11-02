const crypto = require('crypto');
const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');
const notifications = require('./notifications.service');
const { canViewStudent, today, CURRENT_YEAR_SQL } = require('./access.service');
const { likeTerm } = require('../utils/validate');

const round2 = (n) => Math.round(n * 100) / 100;
const forbidden = () => new AppError("You don't have access to this student's fees.", 403);

// Paid so far per (student, fee). Voided payments never count.
const PAID_SUB = `(SELECT student_id, fee_structure_id, SUM(amount) AS paid FROM fee_payments WHERE voided_at IS NULL GROUP BY student_id, fee_structure_id)`;

function lineStatus(amount, paid, dueDate, now) {
  if (round2(amount - paid) <= 0) return 'paid';
  if (dueDate < now) return 'overdue';
  return paid > 0 ? 'partial' : 'due';
}

// ------------------------------------------------------------------ fee structure (admin)
async function listStructures({ yearId, classId }) {
  let year = yearId;
  if (!year) { const [[c]] = await pool.query(`SELECT ${CURRENT_YEAR_SQL} AS id`); year = c.id; }
  if (!year) return [];
  const params = [year];
  let filter = '';
  if (classId) { filter = 'AND fs.class_id = ?'; params.push(classId); }
  const [rows] = await pool.query(
    `SELECT fs.id, fs.class_id AS classId, c.name AS className, fs.fee_type AS feeType, fs.amount, fs.due_date AS dueDate,
            (SELECT COUNT(*) FROM student_enrollments se JOIN sections s ON s.id = se.section_id
              WHERE s.class_id = fs.class_id AND se.academic_year_id = fs.academic_year_id) AS students,
            (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.fee_structure_id = fs.id AND fp.voided_at IS NULL) AS collected
       FROM fee_structures fs JOIN classes c ON c.id = fs.class_id
      WHERE fs.academic_year_id = ? ${filter} ORDER BY c.name, fs.due_date, fs.fee_type`, params);
  return rows.map((r) => ({ ...r, billed: round2(r.students * r.amount), pending: round2(r.students * r.amount - r.collected) }));
}

async function createStructure(actorId, d) {
  const [[cls]] = await pool.query('SELECT id, academic_year_id AS yearId FROM classes WHERE id = ?', [d.classId]);
  if (!cls) throw new AppError('Class not found.', 404);
  const [r] = await pool.query('INSERT INTO fee_structures (academic_year_id, class_id, fee_type, amount, due_date) VALUES (?, ?, ?, ?, ?)',
    [cls.yearId, d.classId, d.feeType, d.amount, d.dueDate]);
  await logActivity(actorId, 'fee_created', 'fee_structure', r.insertId);
  return { id: r.insertId };
}

async function updateStructure(actorId, id, d) {
  const [[high]] = await pool.query(
    `SELECT COALESCE(MAX(t.paid), 0) AS maxPaid FROM (SELECT SUM(amount) AS paid FROM fee_payments WHERE fee_structure_id = ? AND voided_at IS NULL GROUP BY student_id) t`, [id]);
  if (d.amount < high.maxPaid) throw new AppError(`A student has already paid ${high.maxPaid} towards this fee, so the amount can't be lowered below that.`, 409);
  const [r] = await pool.query('UPDATE fee_structures SET fee_type = ?, amount = ?, due_date = ? WHERE id = ?', [d.feeType, d.amount, d.dueDate, id]);
  if (!r.affectedRows) throw new AppError('Fee not found.', 404);
  await logActivity(actorId, 'fee_updated', 'fee_structure', id);
}

async function deleteStructure(actorId, id) {
  const [[n]] = await pool.query('SELECT COUNT(*) AS n FROM fee_payments WHERE fee_structure_id = ?', [id]);
  if (n.n) throw new AppError('Payments have been recorded against this fee, so it can\'t be deleted.', 409);
  const [r] = await pool.query('DELETE FROM fee_structures WHERE id = ?', [id]);
  if (!r.affectedRows) throw new AppError('Fee not found.', 404);
  await logActivity(actorId, 'fee_deleted', 'fee_structure', id);
}

// ------------------------------------------------------------------ one student's fees
async function studentFees(user, studentId, yearId) {
  if (user.role === 'teacher') throw forbidden();
  if (!(await canViewStudent(user, studentId))) throw forbidden();
  let year = yearId;
  if (!year) { const [[c]] = await pool.query(`SELECT ${CURRENT_YEAR_SQL} AS id`); year = c.id; }
  if (!year) return { lines: [], payments: [], totals: { total: 0, paid: 0, remaining: 0, overdue: 0, nextDue: null } };

  const now = await today();
  const [rows] = await pool.query(
    `SELECT fs.id AS structureId, fs.fee_type AS feeType, fs.amount, fs.due_date AS dueDate, COALESCE(p.paid, 0) AS paid
       FROM student_enrollments se JOIN sections s ON s.id = se.section_id
       JOIN fee_structures fs ON fs.class_id = s.class_id AND fs.academic_year_id = se.academic_year_id
       LEFT JOIN ${PAID_SUB} p ON p.student_id = se.student_id AND p.fee_structure_id = fs.id
      WHERE se.student_id = ? AND se.academic_year_id = ? ORDER BY fs.due_date, fs.fee_type`, [studentId, year]);
  const lines = rows.map((r) => {
    const remaining = round2(r.amount - r.paid);
    return { ...r, paid: round2(r.paid), remaining: Math.max(remaining, 0), status: lineStatus(r.amount, r.paid, r.dueDate, now) };
  });
  const [payments] = await pool.query(
    `SELECT fp.id, fp.receipt_no AS receiptNo, fs.fee_type AS feeType, fp.amount, fp.paid_on AS paidOn, fp.method,
            (fp.voided_at IS NOT NULL) AS voided, fp.void_reason AS voidReason
       FROM fee_payments fp JOIN fee_structures fs ON fs.id = fp.fee_structure_id
      WHERE fp.student_id = ? AND fs.academic_year_id = ? ORDER BY fp.paid_on DESC, fp.id DESC`, [studentId, year]);

  const unpaid = lines.filter((l) => l.remaining > 0);
  const totals = {
    total: round2(lines.reduce((a, l) => a + l.amount, 0)),
    paid: round2(lines.reduce((a, l) => a + l.paid, 0)),
    remaining: round2(lines.reduce((a, l) => a + l.remaining, 0)),
    overdue: round2(unpaid.filter((l) => l.status === 'overdue').reduce((a, l) => a + l.remaining, 0)),
    nextDue: unpaid.length ? unpaid.map((l) => l.dueDate).sort()[0] : null,
  };
  return { lines, payments: payments.map((p) => ({ ...p, voided: Boolean(p.voided) })), totals };
}

// ------------------------------------------------------------------ payments (admin)
async function recordPayment(user, d) {
  const now = await today();
  if (d.paidOn > now) throw new AppError("The payment date can't be in the future.", 422);

  const result = await withTransaction(async (conn) => {
    // Locking the student serialises payments for them, so two clerks can't both pay the same balance.
    const [[st]] = await conn.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [d.studentId]);
    if (!st) throw new AppError('Student not found.', 404);
    const [fsRows] = await conn.query('SELECT id, class_id AS classId, academic_year_id AS yearId, amount FROM fee_structures WHERE id = ?', [d.feeStructureId]);
    const fs = fsRows[0];
    if (!fs) throw new AppError('Fee not found.', 404);
    const [enr] = await conn.query(
      `SELECT 1 FROM student_enrollments se JOIN sections s ON s.id = se.section_id
        WHERE se.student_id = ? AND se.academic_year_id = ? AND s.class_id = ?`, [d.studentId, fs.yearId, fs.classId]);
    if (!enr.length) throw new AppError("This fee doesn't apply to that student.", 422);

    const [[paid]] = await conn.query('SELECT COALESCE(SUM(amount), 0) AS paid FROM fee_payments WHERE student_id = ? AND fee_structure_id = ? AND voided_at IS NULL', [d.studentId, d.feeStructureId]);
    const remaining = round2(fs.amount - paid.paid);
    if (remaining <= 0) throw new AppError('This fee is already fully paid.', 409);
    if (d.amount > remaining) throw new AppError(`That is more than the balance of ${remaining}.`, 409);

    // Receipt numbers embed the row id, so they're unique and ordered without a separate counter.
    const [ins] = await conn.query(
      'INSERT INTO fee_payments (student_id, fee_structure_id, amount, paid_on, method, receipt_no, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [d.studentId, d.feeStructureId, d.amount, d.paidOn, d.method, `TMP${crypto.randomBytes(8).toString('hex')}`, user.id]);
    const receiptNo = `R${d.paidOn.slice(0, 4)}${String(ins.insertId).padStart(6, '0')}`;
    await conn.query('UPDATE fee_payments SET receipt_no = ? WHERE id = ?', [receiptNo, ins.insertId]);
    return { id: ins.insertId, receiptNo };
  });
  await logActivity(user.id, 'payment_recorded', 'fee_payment', result.id);
  await notifications.safely(async () => {
    const [[fs]] = await pool.query('SELECT fee_type AS feeType FROM fee_structures WHERE id = ?', [d.feeStructureId]);
    return notifications.notifyStudents([d.studentId],
      { title: 'Payment received', message: `Rs. ${d.amount} received for ${fs.feeType}. Receipt ${result.receiptNo}.`, link: '/pages/fees.html' }, { excludeUserId: user.id });
  });
  return result;
}

async function voidPayment(user, id, { reason }) {
  const [[before]] = await pool.query('SELECT student_id AS studentId, receipt_no AS receiptNo, amount FROM fee_payments WHERE id = ?', [id]);
  const [r] = await pool.query('UPDATE fee_payments SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL', [user.id, reason, id]);
  if (!r.affectedRows) {
    const [[row]] = await pool.query('SELECT id FROM fee_payments WHERE id = ?', [id]);
    throw new AppError(row ? 'This payment is already voided.' : 'Payment not found.', row ? 409 : 404);
  }
  await logActivity(user.id, 'payment_voided', 'fee_payment', id);
  await notifications.safely(() => notifications.notifyStudents([before.studentId],
    { title: 'A payment was voided', message: `Receipt ${before.receiptNo} (Rs. ${before.amount}) was voided: ${reason}`, link: '/pages/fees.html' }, { excludeUserId: user.id }));
}

async function listPayments({ from, to, search, page, limit, offset }) {
  const where = [];
  const params = [];
  if (from) { where.push('fp.paid_on >= ?'); params.push(from); }
  if (to) { where.push('fp.paid_on <= ?'); params.push(to); }
  if (search) {
    where.push('(u.name LIKE ? OR st.admission_no LIKE ? OR fp.receipt_no LIKE ?)');
    const t = likeTerm(search); params.push(t, t, t);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from_ = `FROM fee_payments fp JOIN students st ON st.id = fp.student_id JOIN users u ON u.id = st.user_id
                 JOIN fee_structures fs ON fs.id = fp.fee_structure_id JOIN classes c ON c.id = fs.class_id`;
  const [[agg]] = await pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN fp.voided_at IS NULL THEN fp.amount END), 0) AS collected ${from_} ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT fp.id, fp.receipt_no AS receiptNo, st.id AS studentId, u.name AS studentName, st.admission_no AS admissionNo, c.name AS className,
            fs.fee_type AS feeType, fp.amount, fp.paid_on AS paidOn, fp.method, (fp.voided_at IS NOT NULL) AS voided, fp.void_reason AS voidReason
       ${from_} ${clause} ORDER BY fp.paid_on DESC, fp.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { rows: rows.map((r) => ({ ...r, voided: Boolean(r.voided) })), total: agg.total, collected: round2(agg.collected), page, limit };
}

// ------------------------------------------------------------------ pending / paid list (admin)
async function studentBalances({ search, sectionId, status, page, limit, offset }) {
  const where = [`se.academic_year_id = ${CURRENT_YEAR_SQL}`, 'u.is_active = 1'];
  const params = [];
  if (sectionId) { where.push('se.section_id = ?'); params.push(sectionId); }
  if (search) {
    where.push('(u.name LIKE ? OR st.admission_no LIKE ?)');
    const t = likeTerm(search); params.push(t, t);
  }
  const inner = `SELECT st.id AS studentId, u.name, st.admission_no AS admissionNo, c.name AS className, s.name AS sectionName, se.roll_no AS rollNo,
        SUM(fs.amount) AS total, COALESCE(SUM(p.paid), 0) AS paid, SUM(fs.amount) - COALESCE(SUM(p.paid), 0) AS remaining,
        MIN(CASE WHEN fs.amount > COALESCE(p.paid, 0) THEN fs.due_date END) AS nextDue
      FROM student_enrollments se
      JOIN students st ON st.id = se.student_id JOIN users u ON u.id = st.user_id
      JOIN sections s ON s.id = se.section_id JOIN classes c ON c.id = s.class_id
      JOIN fee_structures fs ON fs.class_id = s.class_id AND fs.academic_year_id = se.academic_year_id
      LEFT JOIN ${PAID_SUB} p ON p.student_id = st.id AND p.fee_structure_id = fs.id
      WHERE ${where.join(' AND ')}
      GROUP BY st.id, u.name, st.admission_no, c.name, s.name, se.roll_no`;
  const having = status === 'pending' ? 'WHERE x.remaining > 0' : status === 'paid' ? 'WHERE x.remaining <= 0' : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM (${inner}) x ${having}`, params);
  const [[sum]] = await pool.query(`SELECT COALESCE(SUM(x.total), 0) AS billed, COALESCE(SUM(x.paid), 0) AS collected, COALESCE(SUM(GREATEST(x.remaining, 0)), 0) AS pending FROM (${inner}) x ${having}`, params);
  const [rows] = await pool.query(`SELECT x.* FROM (${inner}) x ${having} ORDER BY x.remaining DESC, x.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const now = await today();
  return {
    rows: rows.map((r) => ({ ...r, remaining: Math.max(round2(r.remaining), 0), paid: round2(r.paid), overdue: r.remaining > 0 && r.nextDue !== null && r.nextDue < now })),
    total, page, limit, summary: { billed: round2(sum.billed), collected: round2(sum.collected), pending: round2(sum.pending) },
  };
}

// ------------------------------------------------------------------ receipt data (for the PDF)
async function receiptData(user, paymentId) {
  if (user.role === 'teacher') throw forbidden();
  const [rows] = await pool.query(
    `SELECT fp.id, fp.receipt_no AS receiptNo, fp.amount, fp.paid_on AS paidOn, fp.method, fp.student_id AS studentId, fp.fee_structure_id AS structureId,
            (fp.voided_at IS NOT NULL) AS voided, fp.void_reason AS voidReason, fs.fee_type AS feeType, fs.amount AS feeTotal, fs.class_id AS classId,
            ay.name AS yearName, u.name AS studentName, st.admission_no AS admissionNo, rb.name AS receivedBy
       FROM fee_payments fp JOIN fee_structures fs ON fs.id = fp.fee_structure_id JOIN academic_years ay ON ay.id = fs.academic_year_id
       JOIN students st ON st.id = fp.student_id JOIN users u ON u.id = st.user_id JOIN users rb ON rb.id = fp.recorded_by
      WHERE fp.id = ?`, [paymentId]);
  const p = rows[0];
  if (!p) throw new AppError('Payment not found.', 404);
  if (!(await canViewStudent(user, p.studentId))) throw forbidden();
  const [[till]] = await pool.query('SELECT COALESCE(SUM(amount), 0) AS paid FROM fee_payments WHERE student_id = ? AND fee_structure_id = ? AND voided_at IS NULL AND id <= ?', [p.studentId, p.structureId, p.id]);
  const [[place]] = await pool.query(
    `SELECT CONCAT(c.name, ' - ', s.name) AS label FROM student_enrollments se JOIN sections s ON s.id = se.section_id JOIN classes c ON c.id = s.class_id
      WHERE se.student_id = ? AND c.id = ? LIMIT 1`, [p.studentId, p.classId]);
  return { ...p, voided: Boolean(p.voided), paidTillDate: round2(till.paid), balance: Math.max(round2(p.feeTotal - till.paid), 0), classLabel: place ? place.label : '' };
}

module.exports = { listStructures, createStructure, updateStructure, deleteStructure, studentFees, recordPayment, voidPayment, listPayments, studentBalances, receiptData };
