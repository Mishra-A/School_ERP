const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');
const { canViewSection, viewerStudentIds, CURRENT_YEAR_SQL } = require('./access.service');

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SELECT = `SELECT t.id, t.section_id AS sectionId, CONCAT(c.name, ' - ', s.name) AS sectionLabel,
                       cs.id AS classSubjectId, t.subject_id AS subjectId, sub.name AS subjectName,
                       t.teacher_id AS teacherId, u.name AS teacherName,
                       t.day_of_week AS dayOfWeek, t.period_no AS periodNo,
                       TIME_FORMAT(t.start_time, '%H:%i') AS startTime, TIME_FORMAT(t.end_time, '%H:%i') AS endTime, t.room
                  FROM timetable t
                  JOIN sections s ON s.id = t.section_id
                  JOIN classes c ON c.id = s.class_id
                  JOIN subjects sub ON sub.id = t.subject_id
                  JOIN teachers te ON te.id = t.teacher_id
                  JOIN users u ON u.id = te.user_id
                  LEFT JOIN class_subjects cs ON cs.section_id = t.section_id AND cs.subject_id = t.subject_id`;
const ORDER = 'ORDER BY t.day_of_week, t.period_no';

async function forSection(user, sectionId) {
  if (!(await canViewSection(user, sectionId))) throw new AppError("You don't have access to this section's timetable.", 403);
  const [rows] = await pool.query(`${SELECT} WHERE t.section_id = ? ${ORDER}`, [sectionId]);
  return rows;
}

// Role-aware "my timetable": a teacher's own week, a student's section, or one view per child for a parent.
async function mine(user) {
  if (user.role === 'teacher') {
    const [rows] = await pool.query(`${SELECT} WHERE t.teacher_id = ? ${ORDER}`, [user.profileId || 0]);
    return [{ title: 'Your weekly timetable', mode: 'teacher', entries: rows }];
  }
  const ids = await viewerStudentIds(user);
  if (!ids.length) return [];
  const [kids] = await pool.query(
    `SELECT st.id, u.name, se.section_id AS sectionId
       FROM students st JOIN users u ON u.id = st.user_id
       JOIN student_enrollments se ON se.student_id = st.id AND se.academic_year_id = ${CURRENT_YEAR_SQL}
      WHERE st.id IN (?) ORDER BY u.name`, [ids]);
  const views = [];
  for (const k of kids) {
    const [rows] = await pool.query(`${SELECT} WHERE t.section_id = ? ${ORDER}`, [k.sectionId]);
    views.push({ title: user.role === 'parent' ? `${k.name}'s timetable` : 'Your class timetable', mode: 'section', entries: rows });
  }
  return views;
}

// Everything that would make this slot impossible. Runs inside the write transaction.
async function assertNoClash(conn, { sectionId, teacherId, dayOfWeek, periodNo, startTime, endTime, excludeId }) {
  const ex = excludeId || 0;
  const day = DAYS[dayOfWeek];

  const [sec] = await conn.query(
    `SELECT sub.name AS subject, TIME_FORMAT(t.start_time,'%H:%i') AS st, TIME_FORMAT(t.end_time,'%H:%i') AS et
       FROM timetable t JOIN subjects sub ON sub.id = t.subject_id
      WHERE t.section_id = ? AND t.day_of_week = ? AND t.id <> ?
        AND ((t.start_time < ? AND t.end_time > ?) OR t.period_no = ?) LIMIT 1`,
    [sectionId, dayOfWeek, ex, endTime, startTime, periodNo]
  );
  if (sec[0]) throw new AppError(`This section already has ${sec[0].subject} (${sec[0].st}-${sec[0].et}) on ${day} that clashes with this slot.`, 409);

  const [tea] = await conn.query(
    `SELECT u.name AS teacher, CONCAT(c.name, ' - ', s.name) AS label, sub.name AS subject,
            TIME_FORMAT(t.start_time,'%H:%i') AS st, TIME_FORMAT(t.end_time,'%H:%i') AS et
       FROM timetable t
       JOIN teachers te ON te.id = t.teacher_id JOIN users u ON u.id = te.user_id
       JOIN sections s ON s.id = t.section_id JOIN classes c ON c.id = s.class_id
       JOIN subjects sub ON sub.id = t.subject_id
      WHERE t.teacher_id = ? AND t.day_of_week = ? AND t.id <> ?
        AND ((t.start_time < ? AND t.end_time > ?) OR t.period_no = ?) LIMIT 1`,
    [teacherId, dayOfWeek, ex, endTime, startTime, periodNo]
  );
  if (tea[0]) throw new AppError(`${tea[0].teacher} is already teaching ${tea[0].subject} to ${tea[0].label} (${tea[0].st}-${tea[0].et}) on ${day}.`, 409);
}

async function resolveAssignment(conn, classSubjectId, sectionId) {
  const [rows] = await conn.query(
    `SELECT cs.section_id AS sectionId, cs.subject_id AS subjectId, cs.teacher_id AS teacherId
       FROM class_subjects cs WHERE cs.id = ?`, [classSubjectId]);
  if (!rows[0]) throw new AppError('That subject assignment no longer exists.', 422);
  if (sectionId && rows[0].sectionId !== sectionId) throw new AppError('That subject belongs to a different section.', 422);
  return rows[0];
}

// Locking the teacher and section rows serialises concurrent edits, so two admins can't both book the same slot.
async function lock(conn, teacherId, sectionId) {
  await conn.query('SELECT id FROM teachers WHERE id = ? FOR UPDATE', [teacherId]);
  await conn.query('SELECT id FROM sections WHERE id = ? FOR UPDATE', [sectionId]);
}

async function create(actorId, d) {
  const id = await withTransaction(async (conn) => {
    const a = await resolveAssignment(conn, d.classSubjectId);
    await lock(conn, a.teacherId, a.sectionId);
    await assertNoClash(conn, { ...a, ...d });
    const [r] = await conn.query(
      `INSERT INTO timetable (section_id, subject_id, teacher_id, day_of_week, period_no, start_time, end_time, room) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.sectionId, a.subjectId, a.teacherId, d.dayOfWeek, d.periodNo, d.startTime, d.endTime, d.room]
    );
    return r.insertId;
  });
  await logActivity(actorId, 'timetable_created', 'timetable', id);
  return { id };
}

async function update(actorId, id, d) {
  await withTransaction(async (conn) => {
    const [[existing]] = await conn.query('SELECT section_id AS sectionId FROM timetable WHERE id = ?', [id]);
    if (!existing) throw new AppError('Timetable entry not found.', 404);
    const a = await resolveAssignment(conn, d.classSubjectId, existing.sectionId);
    await lock(conn, a.teacherId, a.sectionId);
    await assertNoClash(conn, { ...a, ...d, excludeId: id });
    await conn.query(
      `UPDATE timetable SET subject_id = ?, teacher_id = ?, day_of_week = ?, period_no = ?, start_time = ?, end_time = ?, room = ? WHERE id = ?`,
      [a.subjectId, a.teacherId, d.dayOfWeek, d.periodNo, d.startTime, d.endTime, d.room, id]
    );
  });
  await logActivity(actorId, 'timetable_updated', 'timetable', id);
}

async function remove(actorId, id) {
  const [r] = await pool.query('DELETE FROM timetable WHERE id = ?', [id]);
  if (!r.affectedRows) throw new AppError('Timetable entry not found.', 404);
  await logActivity(actorId, 'timetable_deleted', 'timetable', id);
}

module.exports = { forSection, mine, create, update, remove };
