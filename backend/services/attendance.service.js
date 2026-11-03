const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');
const notifications = require('./notifications.service');
const { canViewSection, CURRENT_YEAR_SQL } = require('./access.service');

// Teachers may only mark or correct attendance this many days back; admins have no limit.
const TEACHER_EDIT_WINDOW_DAYS = 7;

// attended / (present + late + absent); approved leave is left out of the percentage.
const PCT_SQL = (alias = 'a') =>
  `ROUND(100.0 * SUM(${alias}.status IN ('present','late')) / NULLIF(SUM(${alias}.status IN ('present','late','absent')), 0), 1)`;

// The user must be allowed to take this subject in this section (their own class_subjects row, or admin).
async function assertCanMark(conn, user, sectionId, subjectId) {
  const [rows] = await conn.query(
    `SELECT cs.teacher_id
       FROM class_subjects cs
       JOIN sections s ON s.id = cs.section_id
       JOIN classes c ON c.id = s.class_id AND c.academic_year_id = ${CURRENT_YEAR_SQL}
      WHERE cs.section_id = ? AND cs.subject_id = ?`,
    [sectionId, subjectId]
  );
  if (!rows[0]) throw new AppError('That subject is not taught in this section this year.', 422);
  if (user.role === 'teacher' && rows[0].teacher_id !== user.profileId) {
    throw new AppError("You don't teach this subject in this section.", 403);
  }
}

async function loadRoster(conn, sectionId, subjectId, date) {
  const [rows] = await conn.query(
    `SELECT st.id AS studentId, u.name, se.roll_no AS rollNo, st.admission_no AS admissionNo, a.status
       FROM student_enrollments se
       JOIN students st ON st.id = se.student_id
       JOIN users u ON u.id = st.user_id AND u.is_active = 1
       LEFT JOIN attendance a ON a.student_id = st.id AND a.subject_id = ? AND a.attendance_date = ?
      WHERE se.section_id = ? AND se.academic_year_id = ${CURRENT_YEAR_SQL}
      ORDER BY se.roll_no IS NULL, se.roll_no, u.name`,
    [subjectId, date, sectionId]
  );
  return rows;
}

async function roster(user, { sectionId, subjectId, date }) {
  await assertCanMark(pool, user, sectionId, subjectId);
  const students = await loadRoster(pool, sectionId, subjectId, date);
  return { students, alreadyMarked: students.some((s) => s.status) };
}

async function saveBulk(user, { sectionId, subjectId, date, records }) {
  const [[{ daysAgo }]] = await pool.query('SELECT DATEDIFF(CURDATE(), ?) AS daysAgo', [date]);
  if (daysAgo < 0) throw new AppError("You can't mark attendance for a future date.", 422);
  if (user.role === 'teacher' && daysAgo > TEACHER_EDIT_WINDOW_DAYS) {
    throw new AppError(`Teachers can only change attendance from the last ${TEACHER_EDIT_WINDOW_DAYS} days. Ask the office for older dates.`, 403);
  }

  const absentees = await withTransaction(async (conn) => {
    await assertCanMark(conn, user, sectionId, subjectId);
    const roster = await loadRoster(conn, sectionId, subjectId, date);
    const valid = new Set(roster.map((s) => s.studentId));
    const stranger = records.find((r) => !valid.has(r.studentId));
    if (stranger) throw new AppError('One of the students is not in this section.', 422);

    const values = records.map((r) => [r.studentId, sectionId, subjectId, date, r.status, user.id]);
    await conn.query(
      `INSERT INTO attendance (student_id, section_id, subject_id, attendance_date, status, marked_by) VALUES ?
       ON DUPLICATE KEY UPDATE status = VALUES(status), section_id = VALUES(section_id), marked_by = VALUES(marked_by)`,
      [values]
    );
    const before = new Map(roster.map((s) => [s.studentId, s]));
    const [[sub]] = await conn.query('SELECT name FROM subjects WHERE id = ?', [subjectId]);
    // Only students who were not already marked absent for this period, so re-saving doesn't repeat the alert.
    return records.filter((r) => r.status === 'absent' && before.get(r.studentId).status !== 'absent')
      .map((r) => ({ studentId: r.studentId, name: before.get(r.studentId).name, subjectName: sub.name }));
  });
  await logActivity(user.id, 'attendance_marked', 'section', sectionId);
  for (const a of absentees) {
    await notifications.safely(() => notifications.notifyStudents([a.studentId],
      { title: 'Marked absent', message: `${a.name} was marked absent in ${a.subjectName} on ${date}.`, link: `/pages/student.html?id=${a.studentId}`, email: false },
      { students: false, parents: true }));
  }
  return { saved: records.length };
}

async function summaryByStudent(user, studentId, { from, to }) {
  const [[year]] = await pool.query('SELECT start_date AS startDate FROM academic_years WHERE is_current = 1 ORDER BY start_date DESC LIMIT 1');
  const start = from || (year ? year.startDate : null);
  const where = ['a.student_id = ?'];
  const params = [studentId];
  if (start) { where.push('a.attendance_date >= ?'); params.push(start); }
  if (to) { where.push('a.attendance_date <= ?'); params.push(to); }
  const clause = where.join(' AND ');

  const [[total]] = await pool.query(
    `SELECT COALESCE(SUM(a.status='present'),0) AS present, COALESCE(SUM(a.status='absent'),0) AS absent,
            COALESCE(SUM(a.status='late'),0) AS late, COALESCE(SUM(a.status='leave'),0) AS onLeave,
            COUNT(*) AS total, ${PCT_SQL()} AS percent
       FROM attendance a WHERE ${clause}`, params);
  const [bySubject] = await pool.query(
    `SELECT sub.id AS subjectId, sub.name AS subjectName, COUNT(*) AS total, ${PCT_SQL()} AS percent
       FROM attendance a JOIN subjects sub ON sub.id = a.subject_id
      WHERE ${clause} GROUP BY sub.id, sub.name ORDER BY sub.name`, params);
  const [records] = await pool.query(
    `SELECT a.attendance_date AS date, sub.name AS subjectName, a.status
       FROM attendance a JOIN subjects sub ON sub.id = a.subject_id
      WHERE ${clause} ORDER BY a.attendance_date DESC, sub.name LIMIT 100`, params);
  return { from: start, to: to || null, summary: total, bySubject, records };
}

async function sectionReport(user, { sectionId, subjectId, from, to }) {
  if (!(await canViewSection(user, sectionId))) throw new AppError("You don't have access to this section.", 403);
  const params = [from, to];
  let subjectFilter = '';
  if (subjectId) { subjectFilter = 'AND a.subject_id = ?'; params.push(subjectId); }
  params.push(sectionId);
  const [rows] = await pool.query(
    `SELECT st.id AS studentId, u.name, st.admission_no AS admissionNo, se.roll_no AS rollNo,
            COALESCE(SUM(a.status='present'),0) AS present, COALESCE(SUM(a.status='absent'),0) AS absent,
            COALESCE(SUM(a.status='late'),0) AS late, COALESCE(SUM(a.status='leave'),0) AS onLeave,
            COUNT(a.id) AS total, ${PCT_SQL()} AS percent
       FROM student_enrollments se
       JOIN students st ON st.id = se.student_id
       JOIN users u ON u.id = st.user_id
       LEFT JOIN attendance a ON a.student_id = st.id AND a.attendance_date BETWEEN ? AND ? ${subjectFilter}
      WHERE se.section_id = ? AND se.academic_year_id = ${CURRENT_YEAR_SQL} AND u.is_active = 1
      GROUP BY st.id, u.name, st.admission_no, se.roll_no
      ORDER BY se.roll_no IS NULL, se.roll_no, u.name`,
    params
  );
  return { rows };
}

module.exports = { roster, saveBulk, summaryByStudent, sectionReport, TEACHER_EDIT_WINDOW_DAYS };
