const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');

const notFound = (what) => new AppError(`${what} not found.`, 404);

// ---------- Academic years ----------
async function listYears() {
  const [rows] = await pool.query(
    'SELECT id, name, start_date AS startDate, end_date AS endDate, is_current AS isCurrent FROM academic_years ORDER BY start_date DESC'
  );
  return rows.map((r) => ({ ...r, isCurrent: Boolean(r.isCurrent) }));
}

async function createYear(actorId, d) {
  const id = await withTransaction(async (conn) => {
    if (d.isCurrent) await conn.query('UPDATE academic_years SET is_current = 0');
    const [r] = await conn.query(
      'INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES (?, ?, ?, ?)',
      [d.name, d.startDate, d.endDate, d.isCurrent ? 1 : 0]
    );
    return r.insertId;
  });
  await logActivity(actorId, 'academic_year_created', 'academic_year', id);
  return { id };
}

async function updateYear(actorId, id, d) {
  const [r] = await pool.query('UPDATE academic_years SET name = ?, start_date = ?, end_date = ? WHERE id = ?', [d.name, d.startDate, d.endDate, id]);
  if (!r.affectedRows) throw notFound('Academic year');
  await logActivity(actorId, 'academic_year_updated', 'academic_year', id);
}

async function setCurrentYear(actorId, id) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM academic_years WHERE id = ?', [id]);
    if (!rows[0]) throw notFound('Academic year');
    await conn.query('UPDATE academic_years SET is_current = 0');
    await conn.query('UPDATE academic_years SET is_current = 1 WHERE id = ?', [id]);
  });
  await logActivity(actorId, 'academic_year_set_current', 'academic_year', id);
}

// ---------- Classes & sections ----------
async function listClasses(yearId) {
  const [classes] = await pool.query('SELECT id, academic_year_id AS academicYearId, name FROM classes WHERE academic_year_id = ? ORDER BY name', [yearId]);
  if (!classes.length) return [];
  const [sections] = await pool.query(
    `SELECT s.id, s.class_id AS classId, s.name, s.class_teacher_id AS classTeacherId, u.name AS classTeacherName,
            (SELECT COUNT(*) FROM student_enrollments se WHERE se.section_id = s.id) AS studentCount
       FROM sections s
       LEFT JOIN teachers t ON t.id = s.class_teacher_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE s.class_id IN (?) ORDER BY s.name`,
    [classes.map((c) => c.id)]
  );
  return classes.map((c) => ({ ...c, sections: sections.filter((s) => s.classId === c.id) }));
}

async function createClass(actorId, d) {
  const [[year]] = await pool.query('SELECT id FROM academic_years WHERE id = ?', [d.academicYearId]);
  if (!year) throw notFound('Academic year');
  const [r] = await pool.query('INSERT INTO classes (academic_year_id, name) VALUES (?, ?)', [d.academicYearId, d.name]);
  await logActivity(actorId, 'class_created', 'class', r.insertId);
  return { id: r.insertId };
}

async function updateClass(actorId, id, d) {
  const [r] = await pool.query('UPDATE classes SET name = ? WHERE id = ?', [d.name, id]);
  if (!r.affectedRows) throw notFound('Class');
  await logActivity(actorId, 'class_updated', 'class', id);
}

async function deleteClass(actorId, id) {
  const [[sec]] = await pool.query('SELECT COUNT(*) AS n FROM sections WHERE class_id = ?', [id]);
  if (sec.n) throw new AppError('Delete or move this class\'s sections first.', 409);
  const [r] = await pool.query('DELETE FROM classes WHERE id = ?', [id]);
  if (!r.affectedRows) throw notFound('Class');
  await logActivity(actorId, 'class_deleted', 'class', id);
}

async function assertTeacherExists(teacherId) {
  if (!teacherId) return;
  const [rows] = await pool.query('SELECT id FROM teachers WHERE id = ?', [teacherId]);
  if (!rows[0]) throw new AppError('Selected teacher does not exist.', 422);
}

async function createSection(actorId, d) {
  const [[cls]] = await pool.query('SELECT id FROM classes WHERE id = ?', [d.classId]);
  if (!cls) throw notFound('Class');
  await assertTeacherExists(d.classTeacherId);
  const [r] = await pool.query('INSERT INTO sections (class_id, name, class_teacher_id) VALUES (?, ?, ?)', [d.classId, d.name, d.classTeacherId]);
  await logActivity(actorId, 'section_created', 'section', r.insertId);
  return { id: r.insertId };
}

async function updateSection(actorId, id, d) {
  await assertTeacherExists(d.classTeacherId);
  const [r] = await pool.query('UPDATE sections SET name = ?, class_teacher_id = ? WHERE id = ?', [d.name, d.classTeacherId, id]);
  if (!r.affectedRows) throw notFound('Section');
  await logActivity(actorId, 'section_updated', 'section', id);
}

async function deleteSection(actorId, id) {
  const [[enr]] = await pool.query('SELECT COUNT(*) AS n FROM student_enrollments WHERE section_id = ?', [id]);
  if (enr.n) throw new AppError('This section has students enrolled. Move them first.', 409);
  const [[cs]] = await pool.query('SELECT COUNT(*) AS n FROM class_subjects WHERE section_id = ?', [id]);
  if (cs.n) throw new AppError('Remove this section\'s subject assignments first.', 409);
  const [r] = await pool.query('DELETE FROM sections WHERE id = ?', [id]);
  if (!r.affectedRows) throw notFound('Section');
  await logActivity(actorId, 'section_deleted', 'section', id);
}

// Sections of the current academic year, labelled "Class 5 - A", for dropdowns.
async function sectionOptions() {
  const [rows] = await pool.query(
    `SELECT s.id, s.class_id AS classId, CONCAT(c.name, ' - ', s.name) AS label
       FROM sections s JOIN classes c ON c.id = s.class_id
       JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current = 1
      ORDER BY c.name, s.name`
  );
  return rows;
}

// ---------- Subjects ----------
async function listSubjects() {
  const [rows] = await pool.query('SELECT id, name, code FROM subjects ORDER BY name');
  return rows;
}

async function createSubject(actorId, d) {
  const [r] = await pool.query('INSERT INTO subjects (name, code) VALUES (?, ?)', [d.name, d.code]);
  await logActivity(actorId, 'subject_created', 'subject', r.insertId);
  return { id: r.insertId };
}

async function updateSubject(actorId, id, d) {
  const [r] = await pool.query('UPDATE subjects SET name = ?, code = ? WHERE id = ?', [d.name, d.code, id]);
  if (!r.affectedRows) throw notFound('Subject');
  await logActivity(actorId, 'subject_updated', 'subject', id);
}

async function deleteSubject(actorId, id) {
  const [r] = await pool.query('DELETE FROM subjects WHERE id = ?', [id]);
  if (!r.affectedRows) throw notFound('Subject');
  await logActivity(actorId, 'subject_deleted', 'subject', id);
}

// ---------- Teaching assignments (class_subjects) ----------
async function listAssignments(sectionId) {
  const [rows] = await pool.query(
    `SELECT cs.id, cs.section_id AS sectionId, cs.subject_id AS subjectId, sub.name AS subjectName, sub.code AS subjectCode,
            cs.teacher_id AS teacherId, u.name AS teacherName
       FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN teachers t ON t.id = cs.teacher_id
       JOIN users u ON u.id = t.user_id
      WHERE cs.section_id = ? ORDER BY sub.name`,
    [sectionId]
  );
  return rows;
}

async function createAssignment(actorId, d) {
  const [[sec]] = await pool.query('SELECT id FROM sections WHERE id = ?', [d.sectionId]);
  if (!sec) throw notFound('Section');
  const [[sub]] = await pool.query('SELECT id FROM subjects WHERE id = ?', [d.subjectId]);
  if (!sub) throw notFound('Subject');
  await assertTeacherExists(d.teacherId);
  const [r] = await pool.query('INSERT INTO class_subjects (section_id, subject_id, teacher_id) VALUES (?, ?, ?)', [d.sectionId, d.subjectId, d.teacherId]);
  await logActivity(actorId, 'assignment_created', 'class_subject', r.insertId);
  return { id: r.insertId };
}

async function changeAssignmentTeacher(actorId, id, teacherId) {
  await assertTeacherExists(teacherId);
  await withTransaction(async (conn) => {
    const [[cs]] = await conn.query('SELECT section_id, subject_id, teacher_id FROM class_subjects WHERE id = ? FOR UPDATE', [id]);
    if (!cs) throw notFound('Assignment');
    if (cs.teacher_id === teacherId) return;
    // Timetable rows follow the teacher, but only if the new teacher is free at those times.
    const [slots] = await conn.query(
      'SELECT id, day_of_week, start_time, end_time, period_no FROM timetable WHERE section_id = ? AND subject_id = ? AND teacher_id = ?',
      [cs.section_id, cs.subject_id, cs.teacher_id]
    );
    for (const t of slots) {
      const [clash] = await conn.query(
        `SELECT 1 FROM timetable WHERE teacher_id = ? AND day_of_week = ? AND id <> ?
            AND ((start_time < ? AND end_time > ?) OR period_no = ?) LIMIT 1`,
        [teacherId, t.day_of_week, t.id, t.end_time, t.start_time, t.period_no]
      );
      if (clash.length) throw new AppError('The new teacher already has a class at one of this subject\'s timetable slots. Free that slot first.', 409);
    }
    await conn.query('UPDATE timetable SET teacher_id = ? WHERE section_id = ? AND subject_id = ? AND teacher_id = ?', [teacherId, cs.section_id, cs.subject_id, cs.teacher_id]);
    await conn.query('UPDATE class_subjects SET teacher_id = ? WHERE id = ?', [teacherId, id]);
  });
  await logActivity(actorId, 'assignment_teacher_changed', 'class_subject', id);
}

async function deleteAssignment(actorId, id) {
  const [[cs]] = await pool.query('SELECT section_id, subject_id, teacher_id FROM class_subjects WHERE id = ?', [id]);
  if (!cs) throw notFound('Assignment');
  const [[tt]] = await pool.query('SELECT COUNT(*) AS n FROM timetable WHERE section_id = ? AND subject_id = ? AND teacher_id = ?', [cs.section_id, cs.subject_id, cs.teacher_id]);
  if (tt.n) throw new AppError('Remove this subject from the timetable first.', 409);
  const [r] = await pool.query('DELETE FROM class_subjects WHERE id = ?', [id]);
  if (!r.affectedRows) throw notFound('Assignment');
  await logActivity(actorId, 'assignment_deleted', 'class_subject', id);
}

// Section + subject pairs a user may work with: a teacher's own, or all of them for admin (current year only).
async function teachingOptions(user) {
  const params = [];
  let teacherFilter = '';
  if (user.role === 'teacher') { teacherFilter = 'AND cs.teacher_id = ?'; params.push(user.profileId || 0); }
  const [rows] = await pool.query(
    `SELECT cs.id AS classSubjectId, cs.section_id AS sectionId, cs.subject_id AS subjectId,
            CONCAT(c.name, ' - ', s.name) AS sectionLabel, sub.name AS subjectName
       FROM class_subjects cs
       JOIN sections s ON s.id = cs.section_id
       JOIN classes c ON c.id = s.class_id
       JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current = 1
       JOIN subjects sub ON sub.id = cs.subject_id
      WHERE 1 = 1 ${teacherFilter}
      ORDER BY c.name, s.name, sub.name`,
    params
  );
  return rows;
}

module.exports = {
  teachingOptions,
  listYears, createYear, updateYear, setCurrentYear,
  listClasses, createClass, updateClass, deleteClass, createSection, updateSection, deleteSection, sectionOptions,
  listSubjects, createSubject, updateSubject, deleteSubject,
  listAssignments, createAssignment, changeAssignmentTeacher, deleteAssignment,
};
