const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { CURRENT_YEAR_SQL } = require('./access.service');
const fees = require('./fees.service');
const results = require('./results.service');

const round2 = (n) => Math.round(n * 100) / 100;
const PCT = `ROUND(100.0 * SUM(a.status IN ('present','late')) / NULLIF(SUM(a.status IN ('present','late','absent')), 0), 1)`;

// Fee collection for the current year: per class, plus what was collected in a date range, by method and by month.
async function feeReport({ from, to }) {
  const structures = await fees.listStructures({});
  const perClass = new Map();
  for (const s of structures) {
    const c = perClass.get(s.classId) || { classId: s.classId, className: s.className, students: s.students, billed: 0, collected: 0 };
    c.billed = round2(c.billed + s.billed);
    c.collected = round2(c.collected + s.collected);
    perClass.set(s.classId, c);
  }
  const [inRange] = await pool.query(
    `SELECT fs.class_id AS classId, COALESCE(SUM(fp.amount), 0) AS amount FROM fee_payments fp JOIN fee_structures fs ON fs.id = fp.fee_structure_id
      WHERE fp.voided_at IS NULL AND fp.paid_on BETWEEN ? AND ? GROUP BY fs.class_id`, [from, to]);
  const classes = [...perClass.values()].map((c) => ({
    ...c, pending: round2(c.billed - c.collected), collectedInRange: round2((inRange.find((r) => r.classId === c.classId) || { amount: 0 }).amount),
  }));
  const [byMethod] = await pool.query(
    `SELECT method, COUNT(*) AS payments, SUM(amount) AS amount FROM fee_payments WHERE voided_at IS NULL AND paid_on BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC`, [from, to]);
  const [byMonth] = await pool.query(
    `SELECT DATE_FORMAT(paid_on, '%Y-%m') AS month, SUM(amount) AS amount FROM fee_payments
      WHERE voided_at IS NULL AND paid_on >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH) - INTERVAL (DAY(CURDATE()) - 1) DAY
      GROUP BY month ORDER BY month`);
  const sum = (k) => round2(classes.reduce((a, c) => a + c[k], 0));
  return { from, to, classes, byMethod, byMonth, totals: { billed: sum('billed'), collected: sum('collected'), pending: sum('pending'), collectedInRange: sum('collectedInRange') } };
}

async function attendanceReport({ from, to }) {
  const [rows] = await pool.query(
    `SELECT s.id AS sectionId, CONCAT(c.name, ' - ', s.name) AS label,
            (SELECT COUNT(*) FROM student_enrollments se WHERE se.section_id = s.id AND se.academic_year_id = c.academic_year_id) AS students,
            COALESCE(SUM(a.status = 'present'), 0) AS present, COALESCE(SUM(a.status = 'late'), 0) AS late,
            COALESCE(SUM(a.status = 'absent'), 0) AS absent, COALESCE(SUM(a.status = 'leave'), 0) AS onLeave,
            COUNT(a.id) AS records, ${PCT} AS percent
       FROM sections s JOIN classes c ON c.id = s.class_id AND c.academic_year_id = ${CURRENT_YEAR_SQL}
       LEFT JOIN attendance a ON a.section_id = s.id AND a.attendance_date BETWEEN ? AND ?
      GROUP BY s.id, c.name, s.name, c.academic_year_id ORDER BY c.name, s.name`, [from, to]);
  const [low] = await pool.query(
    `SELECT t.section_id AS sectionId, COUNT(*) AS n FROM (
        SELECT a.student_id, a.section_id, 100.0 * SUM(a.status IN ('present','late')) / NULLIF(SUM(a.status IN ('present','late','absent')), 0) AS pct
          FROM attendance a WHERE a.attendance_date BETWEEN ? AND ? GROUP BY a.student_id, a.section_id) t
      WHERE t.pct < 75 GROUP BY t.section_id`, [from, to]);
  return { from, to, sections: rows.map((r) => ({ ...r, lowAttendance: (low.find((l) => l.sectionId === r.sectionId) || { n: 0 }).n })) };
}

async function enrollmentReport() {
  const [rows] = await pool.query(
    `SELECT s.id AS sectionId, c.name AS className, s.name AS sectionName, COUNT(se.id) AS total,
            COALESCE(SUM(st.gender = 'male'), 0) AS male, COALESCE(SUM(st.gender = 'female'), 0) AS female,
            COALESCE(SUM(st.gender = 'other'), 0) AS other, COALESCE(SUM(st.gender IS NULL), 0) AS unspecified
       FROM sections s JOIN classes c ON c.id = s.class_id AND c.academic_year_id = ${CURRENT_YEAR_SQL}
       LEFT JOIN student_enrollments se ON se.section_id = s.id AND se.academic_year_id = c.academic_year_id
       LEFT JOIN students st ON st.id = se.student_id
      GROUP BY s.id, c.name, s.name ORDER BY c.name, s.name`);
  const totals = rows.reduce((a, r) => ({ total: a.total + r.total, male: a.male + Number(r.male), female: a.female + Number(r.female), other: a.other + Number(r.other), unspecified: a.unspecified + Number(r.unspecified) }),
    { total: 0, male: 0, female: 0, other: 0, unspecified: 0 });
  return { sections: rows.map((r) => ({ ...r, male: Number(r.male), female: Number(r.female), other: Number(r.other), unspecified: Number(r.unspecified) })), totals };
}

// Per-section and per-subject results for one exam, built from the same rules as report cards.
async function examReport(adminUser, examId) {
  const [[exam]] = await pool.query('SELECT e.id, e.name, e.class_id AS classId, c.name AS className FROM exams e JOIN classes c ON c.id = e.class_id WHERE e.id = ?', [examId]);
  if (!exam) throw new AppError('Exam not found.', 404);
  const [sections] = await pool.query('SELECT id, name FROM sections WHERE class_id = ? ORDER BY name', [exam.classId]);

  const subjectAgg = new Map();
  const out = [];
  for (const sec of sections) {
    const sheet = await results.classSheet(adminUser, examId, sec.id);
    const complete = sheet.rows.filter((r) => r.result !== 'pending');
    const pct = complete.map((r) => r.percentage);
    out.push({
      sectionId: sec.id, sectionName: sec.name, students: sheet.rows.length,
      completed: complete.length, pending: sheet.rows.length - complete.length,
      passed: complete.filter((r) => r.result === 'pass').length, failed: complete.filter((r) => r.result === 'fail').length,
      averagePercent: pct.length ? round2(pct.reduce((a, b) => a + b, 0) / pct.length) : null,
      highestPercent: pct.length ? Math.max(...pct) : null,
    });
    for (const r of sheet.rows) {
      for (const s of r.subjects) {
        if (s.status === 'pending') continue;
        const a = subjectAgg.get(s.subjectId) || { subjectName: s.subjectName, entered: 0, absent: 0, passed: 0, percentSum: 0, counted: 0 };
        a.entered += 1;
        if (s.absent) a.absent += 1; else { a.percentSum += s.percentage; a.counted += 1; }
        if (s.status === 'pass') a.passed += 1;
        subjectAgg.set(s.subjectId, a);
      }
    }
  }
  const subjects = [...subjectAgg.values()].map((a) => ({
    subjectName: a.subjectName, entered: a.entered, absent: a.absent,
    averagePercent: a.counted ? round2(a.percentSum / a.counted) : null, passRate: a.entered ? round2((100 * a.passed) / a.entered) : null,
  }));
  return { exam, sections: out, subjects };
}

module.exports = { feeReport, attendanceReport, enrollmentReport, examReport };
