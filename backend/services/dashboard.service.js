const { pool } = require('../config/db');
const AppError = require('../utils/AppError');

// Attendance % counts present + late as attended and ignores approved leave:
//   attended / (present + late + absent) * 100
const ATTENDANCE_PCT_SQL = `
  ROUND(100.0 * SUM(status IN ('present','late')) / NULLIF(SUM(status IN ('present','late','absent')), 0), 1)`;

async function currentYear() {
  const [rows] = await pool.query(
    'SELECT id, name FROM academic_years WHERE is_current = 1 ORDER BY start_date DESC LIMIT 1'
  );
  return rows[0] || null;
}

async function recentNotices(audience, classIds = []) {
  const params = [audience];
  let classFilter = 'class_id IS NULL';
  if (classIds.length) {
    classFilter = 'class_id IS NULL OR class_id IN (?)';
    params.push(classIds);
  }
  const [rows] = await pool.query(
    `SELECT id, title, publish_date FROM notices
      WHERE audience IN ('all', ?) AND (${classFilter}) AND publish_date <= CURDATE()
      ORDER BY publish_date DESC, id DESC LIMIT 5`,
    params
  );
  return rows;
}

async function feeSummaryForStudent(studentId, yearId) {
  const [[due]] = await pool.query(
    `SELECT COALESCE(SUM(fs.amount), 0) AS total
       FROM student_enrollments se
       JOIN sections s ON s.id = se.section_id
       JOIN fee_structures fs ON fs.class_id = s.class_id AND fs.academic_year_id = se.academic_year_id
      WHERE se.student_id = ? AND se.academic_year_id = ?`,
    [studentId, yearId]
  );
  const [[paid]] = await pool.query(
    `SELECT COALESCE(SUM(fp.amount), 0) AS total
       FROM fee_payments fp JOIN fee_structures fs ON fs.id = fp.fee_structure_id
      WHERE fp.student_id = ? AND fs.academic_year_id = ? AND fp.voided_at IS NULL`,
    [studentId, yearId]
  );
  return { total: due.total, paid: paid.total, remaining: Math.max(due.total - paid.total, 0) };
}

async function studentSummary(studentId, year) {
  const [[student]] = await pool.query(
    `SELECT st.id, u.name, st.admission_no FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?`,
    [studentId]
  );
  if (!student) return null;

  let placement = null;
  if (year) {
    const [rows] = await pool.query(
      `SELECT se.section_id, se.roll_no, s.name AS section_name, c.id AS class_id, c.name AS class_name
         FROM student_enrollments se
         JOIN sections s ON s.id = se.section_id
         JOIN classes c ON c.id = s.class_id
        WHERE se.student_id = ? AND se.academic_year_id = ?`,
      [studentId, year.id]
    );
    placement = rows[0] || null;
  }

  const [[att]] = await pool.query(
    `SELECT ${ATTENDANCE_PCT_SQL} AS pct, COUNT(*) AS records
       FROM attendance WHERE student_id = ?
        ${year ? 'AND attendance_date BETWEEN (SELECT start_date FROM academic_years WHERE id = ?) AND (SELECT end_date FROM academic_years WHERE id = ?)' : ''}`,
    year ? [studentId, year.id, year.id] : [studentId]
  );

  let upcomingExams = [];
  let fees = { total: 0, paid: 0, remaining: 0 };
  if (year && placement) {
    [upcomingExams] = await pool.query(
      `SELECT e.name AS exam, sub.name AS subject, es.exam_date, es.start_time
         FROM exam_schedules es
         JOIN exams e ON e.id = es.exam_id
         JOIN subjects sub ON sub.id = es.subject_id
        WHERE e.class_id = ? AND e.academic_year_id = ? AND es.exam_date >= CURDATE()
        ORDER BY es.exam_date, es.start_time LIMIT 5`,
      [placement.class_id, year.id]
    );
    fees = await feeSummaryForStudent(studentId, year.id);
  }

  const [perfRows] = await pool.query(
    `SELECT e.name, ROUND(100 * SUM(m.marks_obtained) / SUM(es.max_marks), 1) AS percentage
       FROM marks m JOIN exam_schedules es ON es.id = m.exam_schedule_id JOIN exams e ON e.id = es.exam_id
      WHERE m.student_id = ? GROUP BY e.id, e.name, e.start_date ORDER BY e.start_date DESC, e.id DESC LIMIT 6`, [studentId]);

  return {
    id: student.id,
    name: student.name,
    admissionNo: student.admission_no,
    performance: perfRows.reverse(),
    classId: placement ? placement.class_id : null,
    className: placement ? placement.class_name : null,
    sectionName: placement ? placement.section_name : null,
    rollNo: placement ? placement.roll_no : null,
    attendancePercent: att.records ? att.pct : null,
    upcomingExams,
    fees,
  };
}

async function adminDashboard(year, windowDays) {
  const yearId = year ? year.id : null;

  const [[students]] = await pool.query(
    `SELECT COUNT(*) AS n FROM students st JOIN users u ON u.id = st.user_id WHERE u.is_active = 1`
  );
  const [[teachers]] = await pool.query(
    `SELECT COUNT(*) AS n FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.is_active = 1`
  );
  const [[classes]] = await pool.query(
    yearId ? 'SELECT COUNT(*) AS n FROM classes WHERE academic_year_id = ?' : 'SELECT COUNT(*) AS n FROM classes',
    yearId ? [yearId] : []
  );

  const [[today]] = await pool.query(
    `SELECT COALESCE(SUM(status='present'),0) AS present, COALESCE(SUM(status='absent'),0) AS absent,
            COALESCE(SUM(status='late'),0) AS late, COALESCE(SUM(status='leave'),0) AS onLeave,
            ${ATTENDANCE_PCT_SQL} AS pct, COUNT(DISTINCT student_id) AS studentsMarked
       FROM attendance WHERE attendance_date = CURDATE()`
  );

  let pendingFees = 0;
  let upcomingExams = [];
  let enrollment = [];
  if (yearId) {
    const [[due]] = await pool.query(
      `SELECT COALESCE(SUM(fs.amount), 0) AS total
         FROM student_enrollments se
         JOIN sections s ON s.id = se.section_id
         JOIN fee_structures fs ON fs.class_id = s.class_id AND fs.academic_year_id = se.academic_year_id
        WHERE se.academic_year_id = ?`,
      [yearId]
    );
    const [[paid]] = await pool.query(
      `SELECT COALESCE(SUM(fp.amount), 0) AS total
         FROM fee_payments fp JOIN fee_structures fs ON fs.id = fp.fee_structure_id
        WHERE fs.academic_year_id = ? AND fp.voided_at IS NULL`,
      [yearId]
    );
    pendingFees = Math.max(due.total - paid.total, 0);

    [upcomingExams] = await pool.query(
      `SELECT e.name AS exam, c.name AS class_name, sub.name AS subject, es.exam_date
         FROM exam_schedules es
         JOIN exams e ON e.id = es.exam_id
         JOIN classes c ON c.id = e.class_id
         JOIN subjects sub ON sub.id = es.subject_id
        WHERE e.academic_year_id = ? AND es.exam_date >= CURDATE()
        ORDER BY es.exam_date LIMIT 5`,
      [yearId]
    );

    [enrollment] = await pool.query(
      `SELECT c.name AS label, COUNT(se.id) AS value
         FROM classes c
         JOIN sections s ON s.class_id = c.id
         LEFT JOIN student_enrollments se ON se.section_id = s.id AND se.academic_year_id = c.academic_year_id
        WHERE c.academic_year_id = ?
        GROUP BY c.id, c.name ORDER BY c.name`,
      [yearId]
    );
  }

  const [attendanceTrend] = await pool.query(
     `SELECT attendance_date AS day, ${ATTENDANCE_PCT_SQL} AS pct
       FROM attendance WHERE attendance_date >= DATE_SUB(CURDATE(), INTERVAL ${windowDays - 1} DAY)
      GROUP BY attendance_date ORDER BY attendance_date`
  );

  // Fee collection for the last 6 months (months with no payments show as 0).
  const [feeRows] = await pool.query(
    `SELECT DATE_FORMAT(paid_on, '%Y-%m') AS month, SUM(amount) AS amount FROM fee_payments
      WHERE voided_at IS NULL AND paid_on >= DATE_SUB(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), INTERVAL DAY(CURDATE()) - 1 DAY) GROUP BY month`);
  const feeCollection = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const hit = feeRows.find((r) => r.month === key);
    feeCollection.push({ month: key, label: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }), amount: hit ? Number(hit.amount) : 0 });
  }

  // Average score per exam this year (marks obtained over maximum marks, absent counted as 0).
  let performance = [];
  if (yearId) {
    [performance] = await pool.query(
      `SELECT CONCAT(e.name, ' (', c.name, ')') AS label, ROUND(100 * SUM(m.marks_obtained) / SUM(es.max_marks), 1) AS percentage
         FROM marks m JOIN exam_schedules es ON es.id = m.exam_schedule_id JOIN exams e ON e.id = es.exam_id JOIN classes c ON c.id = e.class_id
        WHERE e.academic_year_id = ? GROUP BY e.id, e.name, c.name, e.start_date ORDER BY e.start_date DESC, e.id DESC LIMIT 8`, [yearId]);
    performance.reverse();
  }

  const [teacherAttendance] = await pool.query(
    `SELECT u.name AS teacher_name,
            ROUND(100 * SUM(status IN ('present','late')) / NULLIF(SUM(status IN ('present','late','absent')), 0), 1) AS pct,
            SUM(status = 'present') AS present,
            SUM(status = 'late') AS late,
            SUM(status = 'absent') AS absent,
            COUNT(*) AS records
       FROM teacher_attendance ta
       JOIN teachers t ON t.id = ta.teacher_id
       JOIN users u ON u.id = t.user_id
      WHERE ta.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ${windowDays - 1} DAY)
      GROUP BY t.id, u.name
      ORDER BY u.name`
  );

  const [teacherPerformance] = yearId ? await pool.query(
    `SELECT u.name AS teacher_name,
            ROUND(100 * SUM(m.marks_obtained) / SUM(es.max_marks), 1) AS percentage,
            COUNT(DISTINCT e.id) AS exams
       FROM class_subjects cs
       JOIN sections sec ON sec.id = cs.section_id
       JOIN teachers t ON t.id = cs.teacher_id
       JOIN users u ON u.id = t.user_id
       JOIN exam_schedules es ON es.subject_id = cs.subject_id
       JOIN exams e ON e.id = es.exam_id AND e.class_id = sec.class_id
       JOIN marks m ON m.exam_schedule_id = es.id
      WHERE e.academic_year_id = ?
      GROUP BY t.id, u.name
      ORDER BY u.name`,
    [yearId]
  ) : [[]];

  const [recentActivities] = await pool.query(
    `SELECT l.action, l.entity, l.created_at, u.name AS user_name
       FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.id DESC LIMIT 8`
  );

  return {
    stats: {
      students: students.n,
      teachers: teachers.n,
      classes: classes.n,
      pendingFees,
      todayAttendance: today,
    },
    upcomingExams,
    recentActivities,
    teacherAttendance,
    teacherPerformance,
    windowDays,
    charts: { attendanceTrend, enrollment, feeCollection, performance },
  };
}

async function teacherDashboard(teacherId, year) {
  const [assigned] = await pool.query(
    `SELECT cs.id, c.name AS class_name, s.name AS section_name, sub.name AS subject,
            (SELECT COUNT(*) FROM student_enrollments se WHERE se.section_id = s.id
               ${year ? 'AND se.academic_year_id = ?' : ''}) AS students
       FROM class_subjects cs
       JOIN sections s ON s.id = cs.section_id
       JOIN classes c ON c.id = s.class_id
       JOIN subjects sub ON sub.id = cs.subject_id
      WHERE cs.teacher_id = ? ${year ? 'AND c.academic_year_id = ?' : ''}
      ORDER BY c.name, s.name, sub.name`,
    year ? [year.id, teacherId, year.id] : [teacherId]
  );

  const [todaySchedule] = await pool.query(
    `SELECT t.period_no, t.start_time, t.end_time, t.room, c.name AS class_name, s.name AS section_name, sub.name AS subject
       FROM timetable t
       JOIN sections s ON s.id = t.section_id
       JOIN classes c ON c.id = s.class_id
       JOIN subjects sub ON sub.id = t.subject_id
      WHERE t.teacher_id = ? AND t.day_of_week = WEEKDAY(CURDATE()) + 1
      ORDER BY t.period_no`,
    [teacherId]
  );

  const [classRows] = await pool.query(
    `SELECT DISTINCT s.class_id FROM class_subjects cs JOIN sections s ON s.id = cs.section_id WHERE cs.teacher_id = ?`,
    [teacherId]
  );
  const notices = await recentNotices('teachers', classRows.map((r) => r.class_id));

  const uniqueSections = new Set(assigned.map((a) => `${a.class_name}-${a.section_name}`));
  return {
    stats: {
      sections: uniqueSections.size,
      subjectsTaught: assigned.length,
      studentsReached: assigned.reduce((sum, a) => sum + a.students, 0),
      periodsToday: todaySchedule.length,
    },
    assigned,
    todaySchedule,
    notices,
  };
}

async function studentDashboard(studentId, year) {
  const summary = await studentSummary(studentId, year);
  if (!summary) throw new AppError('Student profile not found.', 404);
  const notices = await recentNotices('students', summary.classId ? [summary.classId] : []);
  return { student: summary, notices };
}

async function parentDashboard(parentId, year) {
  const [kids] = await pool.query('SELECT student_id, relation FROM parent_students WHERE parent_id = ?', [parentId]);
  const children = [];
  for (const kid of kids) {
    const summary = await studentSummary(kid.student_id, year);
    if (summary) children.push({ ...summary, relation: kid.relation });
  }
  const notices = await recentNotices('parents', children.map((c) => c.classId).filter(Boolean));
  return { children, notices };
}

async function getDashboard(user, windowDays = 7) {
  if (user.role !== 'admin' && !user.profileId) {
    throw new AppError('Your profile is not set up yet. Contact the school office.', 404);
  }
  const year = await currentYear();
  const [events] = await pool.query(
    `SELECT id, title, event_type AS eventType, start_date AS startDate, end_date AS endDate FROM events
      WHERE COALESCE(end_date, start_date) >= CURDATE() ORDER BY start_date LIMIT 5`
  );
  const base = { academicYear: year ? year.name : null, hasAcademicYear: Boolean(year), role: user.role, events };

  switch (user.role) {
    case 'admin':
      return { ...base, ...(await adminDashboard(year, windowDays)) };
    case 'teacher':
      return { ...base, ...(await teacherDashboard(user.profileId, year)) };
    case 'student':
      return { ...base, ...(await studentDashboard(user.profileId, year)) };
    case 'parent':
      return { ...base, ...(await parentDashboard(user.profileId, year)) };
    default:
      throw new AppError('Unknown role.', 403);
  }
}

module.exports = { getDashboard };
