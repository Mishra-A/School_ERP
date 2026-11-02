const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');
const { canViewStudent, viewerStudentIds, today, CURRENT_YEAR_SQL } = require('./access.service');

const forbidden = () => new AppError("You don't have access to this exam.", 403);

const EXAM_SELECT = `SELECT e.id, e.name, e.start_date AS startDate, e.end_date AS endDate, e.class_id AS classId, c.name AS className,
                            e.academic_year_id AS yearId, ay.name AS yearName,
                            (SELECT COUNT(*) FROM exam_schedules es WHERE es.exam_id = e.id) AS subjectCount
                       FROM exams e JOIN classes c ON c.id = e.class_id JOIN academic_years ay ON ay.id = e.academic_year_id`;

async function loadExam(id) {
  const [rows] = await pool.query(`${EXAM_SELECT} WHERE e.id = ?`, [id]);
  if (!rows[0]) throw new AppError('Exam not found.', 404);
  return rows[0];
}

async function teacherTeachesClass(teacherId, classId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM class_subjects cs JOIN sections s ON s.id = cs.section_id WHERE cs.teacher_id = ? AND s.class_id = ?
     UNION SELECT 1 FROM sections WHERE class_teacher_id = ? AND class_id = ? LIMIT 1`,
    [teacherId, classId, teacherId, classId]
  );
  return rows.length > 0;
}

async function canViewExam(user, exam) {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return Boolean(user.profileId) && teacherTeachesClass(user.profileId, exam.classId);
  const ids = await viewerStudentIds(user);
  if (!ids.length) return false;
  const [rows] = await pool.query(
    `SELECT 1 FROM student_enrollments se JOIN sections s ON s.id = se.section_id
      WHERE se.student_id IN (?) AND s.class_id = ? AND se.academic_year_id = ? LIMIT 1`,
    [ids, exam.classId, exam.yearId]
  );
  return rows.length > 0;
}

async function scheduleOf(examId, withCounts) {
  const [rows] = await pool.query(
    `SELECT es.id, es.subject_id AS subjectId, sub.name AS subjectName, es.exam_date AS examDate,
            TIME_FORMAT(es.start_time, '%H:%i') AS startTime, es.max_marks AS maxMarks, es.pass_marks AS passMarks
            ${withCounts ? ', (SELECT COUNT(*) FROM marks m WHERE m.exam_schedule_id = es.id) AS marksCount' : ''}
       FROM exam_schedules es JOIN subjects sub ON sub.id = es.subject_id
      WHERE es.exam_id = ? ORDER BY es.exam_date, es.start_time, sub.name`,
    [examId]
  );
  return rows;
}

async function list(user, { yearId }) {
  let year = yearId;
  if (!year) {
    const [[cur]] = await pool.query(`SELECT ${CURRENT_YEAR_SQL} AS id`);
    year = cur.id;
  }
  if (!year) return [];
  const params = [year];
  let filter = '';
  if (user.role === 'teacher') {
    filter = `AND (e.class_id IN (SELECT s.class_id FROM class_subjects cs JOIN sections s ON s.id = cs.section_id WHERE cs.teacher_id = ?)
                OR e.class_id IN (SELECT class_id FROM sections WHERE class_teacher_id = ?))`;
    params.push(user.profileId || 0, user.profileId || 0);
  }
  const [rows] = await pool.query(`${EXAM_SELECT} WHERE e.academic_year_id = ? ${filter} ORDER BY e.start_date DESC, e.id DESC`, params);
  return rows;
}

async function get(user, id) {
  const exam = await loadExam(id);
  if (!(await canViewExam(user, exam))) throw forbidden();
  return { exam, schedule: await scheduleOf(id, user.role === 'admin' || user.role === 'teacher') };
}

// Exams (with their date sheet) for a student's current class.
async function forStudent(user, studentId) {
  if (!(await canViewStudent(user, studentId))) throw forbidden();
  const [exams] = await pool.query(
    `${EXAM_SELECT}
      WHERE (e.class_id, e.academic_year_id) IN (
              SELECT s.class_id, se.academic_year_id FROM student_enrollments se JOIN sections s ON s.id = se.section_id
               WHERE se.student_id = ? AND se.academic_year_id = ${CURRENT_YEAR_SQL})
      ORDER BY e.start_date DESC, e.id DESC`,
    [studentId]
  );
  const now = await today();
  const out = [];
  for (const e of exams) {
    const schedule = await scheduleOf(e.id, false);
    out.push({ ...e, schedule, upcoming: schedule.some((s) => s.examDate >= now) });
  }
  return out;
}

async function create(actorId, d) {
  const [[cls]] = await pool.query('SELECT id, academic_year_id AS yearId FROM classes WHERE id = ?', [d.classId]);
  if (!cls) throw new AppError('Class not found.', 404);
  const [r] = await pool.query('INSERT INTO exams (academic_year_id, class_id, name, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
    [cls.yearId, d.classId, d.name, d.startDate, d.endDate]);
  await logActivity(actorId, 'exam_created', 'exam', r.insertId);
  return { id: r.insertId };
}

async function update(actorId, id, d) {
  const [r] = await pool.query('UPDATE exams SET name = ?, start_date = ?, end_date = ? WHERE id = ?', [d.name, d.startDate, d.endDate, id]);
  if (!r.affectedRows) throw new AppError('Exam not found.', 404);
  await logActivity(actorId, 'exam_updated', 'exam', id);
}

async function remove(actorId, id) {
  await withTransaction(async (conn) => {
    const [[exam]] = await conn.query('SELECT id FROM exams WHERE id = ? FOR UPDATE', [id]);
    if (!exam) throw new AppError('Exam not found.', 404);
    const [[m]] = await conn.query('SELECT COUNT(*) AS n FROM marks m JOIN exam_schedules es ON es.id = m.exam_schedule_id WHERE es.exam_id = ?', [id]);
    if (m.n) throw new AppError('Marks have already been entered for this exam, so it can\'t be deleted.', 409);
    await conn.query('DELETE FROM exam_schedules WHERE exam_id = ?', [id]);
    await conn.query('DELETE FROM exams WHERE id = ?', [id]);
  });
  await logActivity(actorId, 'exam_deleted', 'exam', id);
}

async function addSchedule(actorId, examId, d) {
  const exam = await loadExam(examId);
  // Only subjects this class actually has a teacher for can be examined.
  const [ok] = await pool.query(
    'SELECT 1 FROM class_subjects cs JOIN sections s ON s.id = cs.section_id WHERE s.class_id = ? AND cs.subject_id = ? LIMIT 1',
    [exam.classId, d.subjectId]
  );
  if (!ok.length) throw new AppError("That subject isn't taught in this class. Assign it to a teacher under Academics first.", 422);
  const [r] = await pool.query(
    'INSERT INTO exam_schedules (exam_id, subject_id, exam_date, start_time, max_marks, pass_marks) VALUES (?, ?, ?, ?, ?, ?)',
    [examId, d.subjectId, d.examDate, d.startTime, d.maxMarks, d.passMarks]
  );
  await logActivity(actorId, 'exam_schedule_added', 'exam', examId);
  return { id: r.insertId };
}

async function updateSchedule(actorId, id, d) {
  const [[over]] = await pool.query('SELECT COUNT(*) AS n FROM marks WHERE exam_schedule_id = ? AND marks_obtained > ?', [id, d.maxMarks]);
  if (over.n) throw new AppError('Some students already have marks above that maximum. Correct their marks first.', 409);
  const [r] = await pool.query('UPDATE exam_schedules SET exam_date = ?, start_time = ?, max_marks = ?, pass_marks = ? WHERE id = ?', [d.examDate, d.startTime, d.maxMarks, d.passMarks, id]);
  if (!r.affectedRows) throw new AppError('Exam subject not found.', 404);
  await logActivity(actorId, 'exam_schedule_updated', 'exam_schedule', id);
}

async function removeSchedule(actorId, id) {
  const [[m]] = await pool.query('SELECT COUNT(*) AS n FROM marks WHERE exam_schedule_id = ?', [id]);
  if (m.n) throw new AppError('Marks have already been entered for this subject, so it can\'t be removed.', 409);
  const [r] = await pool.query('DELETE FROM exam_schedules WHERE id = ?', [id]);
  if (!r.affectedRows) throw new AppError('Exam subject not found.', 404);
  await logActivity(actorId, 'exam_schedule_removed', 'exam_schedule', id);
}

module.exports = { list, get, forStudent, create, update, remove, addSchedule, updateSchedule, removeSchedule };
