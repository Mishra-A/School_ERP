const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');
const notifications = require('./notifications.service');
const { today, CURRENT_YEAR_SQL } = require('./access.service');

// Loads the exam subject and checks the section belongs to the exam's class and the user may enter its marks.
async function authorise(conn, user, examScheduleId, sectionId) {
  const [rows] = await conn.query(
    `SELECT es.id, es.subject_id AS subjectId, es.exam_date AS examDate, es.max_marks AS maxMarks, es.pass_marks AS passMarks,
            e.id AS examId, e.name AS examName, e.class_id AS classId, e.academic_year_id AS yearId, sub.name AS subjectName
       FROM exam_schedules es JOIN exams e ON e.id = es.exam_id JOIN subjects sub ON sub.id = es.subject_id WHERE es.id = ?`, [examScheduleId]);
  const es = rows[0];
  if (!es) throw new AppError('Exam subject not found.', 404);

  const [[sec]] = await conn.query('SELECT s.id, CONCAT(c.name, " - ", s.name) AS label FROM sections s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND s.class_id = ?', [sectionId, es.classId]);
  if (!sec) throw new AppError("That section isn't in this exam's class.", 422);

  const [cs] = await conn.query('SELECT teacher_id FROM class_subjects WHERE section_id = ? AND subject_id = ?', [sectionId, es.subjectId]);
  if (!cs[0]) throw new AppError('That subject is not taught in this section.', 422);
  if (user.role === 'teacher' && cs[0].teacher_id !== user.profileId) throw new AppError("You don't teach this subject in this section.", 403);
  return { ...es, sectionLabel: sec.label };
}

async function loadStudents(conn, es, sectionId) {
  const [rows] = await conn.query(
    `SELECT st.id AS studentId, u.name, st.admission_no AS admissionNo, se.roll_no AS rollNo, m.marks_obtained AS marks, m.is_absent AS absent
       FROM student_enrollments se
       JOIN students st ON st.id = se.student_id
       JOIN users u ON u.id = st.user_id AND u.is_active = 1
       LEFT JOIN marks m ON m.exam_schedule_id = ? AND m.student_id = st.id
      WHERE se.section_id = ? AND se.academic_year_id = ?
      ORDER BY se.roll_no IS NULL, se.roll_no, u.name`,
    [es.id, sectionId, es.yearId]
  );
  return rows.map((r) => ({ ...r, absent: Boolean(r.absent), marks: r.marks === null ? null : Number(r.marks) }));
}

// Exam subjects the user may enter marks for (current year): a teacher's own subjects, or everything for admin.
async function options(user) {
  const params = [];
  let filter = '';
  if (user.role === 'teacher') { filter = 'AND cs.teacher_id = ?'; params.push(user.profileId || 0); }
  const [rows] = await pool.query(
    `SELECT es.id AS examScheduleId, e.id AS examId, e.name AS examName, es.exam_date AS examDate, es.max_marks AS maxMarks,
            es.pass_marks AS passMarks, sub.name AS subjectName, s.id AS sectionId, CONCAT(c.name, ' - ', s.name) AS sectionLabel
       FROM exam_schedules es
       JOIN exams e ON e.id = es.exam_id
       JOIN classes c ON c.id = e.class_id AND c.academic_year_id = ${CURRENT_YEAR_SQL}
       JOIN sections s ON s.class_id = c.id
       JOIN class_subjects cs ON cs.section_id = s.id AND cs.subject_id = es.subject_id
       JOIN subjects sub ON sub.id = es.subject_id
      WHERE 1 = 1 ${filter}
      ORDER BY es.exam_date DESC, e.name, c.name, s.name, sub.name`, params);
  return rows;
}

async function sheet(user, { examScheduleId, sectionId }) {
  const es = await authorise(pool, user, examScheduleId, sectionId);
  return { subject: es, students: await loadStudents(pool, es, sectionId) };
}

async function save(user, { examScheduleId, sectionId, records }) {
  const now = await today();
  const { es: subject, newIds } = await withTransaction(async (conn) => {
    const es = await authorise(conn, user, examScheduleId, sectionId);
    if (es.examDate > now) throw new AppError(`This exam is on ${es.examDate}. Marks can be entered once it has taken place.`, 422);
    const valid = new Set((await loadStudents(conn, es, sectionId)).map((s) => s.studentId));
    if (records.some((r) => !valid.has(r.studentId))) throw new AppError('One of the students is not in this section.', 422);
    const bad = records.find((r) => r.marks !== null && r.marks > es.maxMarks);
    if (bad) throw new AppError(`Marks can't be more than the maximum of ${es.maxMarks}.`, 422);

    const [had] = await conn.query('SELECT student_id AS id FROM marks WHERE exam_schedule_id = ? AND student_id IN (?)', [examScheduleId, records.map((r) => r.studentId)]);
    const hadSet = new Set(had.map((h) => h.id));
    const fresh = records.filter((r) => (r.absent || r.marks !== null) && !hadSet.has(r.studentId)).map((r) => r.studentId);

    for (const r of records) {
      if (r.absent) {
        await conn.query(
          `INSERT INTO marks (exam_schedule_id, student_id, marks_obtained, is_absent, entered_by) VALUES (?, ?, 0, 1, ?)
           ON DUPLICATE KEY UPDATE marks_obtained = 0, is_absent = 1, entered_by = VALUES(entered_by)`,
          [examScheduleId, r.studentId, user.id]);
      } else if (r.marks === null) {
        await conn.query('DELETE FROM marks WHERE exam_schedule_id = ? AND student_id = ?', [examScheduleId, r.studentId]);
      } else {
        await conn.query(
          `INSERT INTO marks (exam_schedule_id, student_id, marks_obtained, is_absent, entered_by) VALUES (?, ?, ?, 0, ?)
           ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), is_absent = 0, entered_by = VALUES(entered_by)`,
          [examScheduleId, r.studentId, r.marks, user.id]);
      }
    }
    return { es, newIds: fresh };
  });
  await logActivity(user.id, 'marks_entered', 'exam_schedule', examScheduleId);
  await notifications.safely(() => notifications.notifyStudents(newIds,
    { title: `New marks: ${subject.subjectName}`, message: subject.examName, link: '/pages/results.html', email: false }, { excludeUserId: user.id }));
  return { saved: records.length };
}

module.exports = { options, sheet, save };
