const { pool } = require('../config/db');

// Single source of truth for "may this user see this student?".
// Called by every route that takes a student id, so changing an id in the URL never exposes another student.
async function canViewStudent(user, studentId) {
  switch (user.role) {
    case 'admin':
      return true;
    case 'student':
      return user.profileId === studentId;
    case 'parent': {
      const [rows] = await pool.query('SELECT 1 FROM parent_students WHERE parent_id = ? AND student_id = ? LIMIT 1', [user.profileId, studentId]);
      return rows.length > 0;
    }
    case 'teacher': {
      if (!user.profileId) return false;
      const [rows] = await pool.query(
        `SELECT 1
           FROM student_enrollments se
           JOIN academic_years ay ON ay.id = se.academic_year_id AND ay.is_current = 1
          WHERE se.student_id = ?
            AND (se.section_id IN (SELECT section_id FROM class_subjects WHERE teacher_id = ?)
              OR se.section_id IN (SELECT id FROM sections WHERE class_teacher_id = ?))
          LIMIT 1`,
        [studentId, user.profileId, user.profileId]
      );
      return rows.length > 0;
    }
    default:
      return false;
  }
}

const CURRENT_YEAR_SQL = '(SELECT id FROM academic_years WHERE is_current = 1 ORDER BY start_date DESC LIMIT 1)';

// Students a user "is" or "looks after": themselves (student) or their linked children (parent).
async function viewerStudentIds(user) {
  if (user.role === 'student') return user.profileId ? [user.profileId] : [];
  if (user.role === 'parent') {
    const [rows] = await pool.query('SELECT student_id FROM parent_students WHERE parent_id = ?', [user.profileId || 0]);
    return rows.map((r) => r.student_id);
  }
  return [];
}

// May this user see things that belong to a whole section (timetable, assignments, materials)?
async function canViewSection(user, sectionId) {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') {
    if (!user.profileId) return false;
    const [rows] = await pool.query(
      `SELECT 1 FROM class_subjects WHERE section_id = ? AND teacher_id = ?
       UNION SELECT 1 FROM sections WHERE id = ? AND class_teacher_id = ? LIMIT 1`,
      [sectionId, user.profileId, sectionId, user.profileId]
    );
    return rows.length > 0;
  }
  const ids = await viewerStudentIds(user);
  if (!ids.length) return false;
  const [rows] = await pool.query(
    `SELECT 1 FROM student_enrollments WHERE section_id = ? AND student_id IN (?) AND academic_year_id = ${CURRENT_YEAR_SQL} LIMIT 1`,
    [sectionId, ids]
  );
  return rows.length > 0;
}

async function today() {
  const [[row]] = await pool.query('SELECT CURDATE() AS today');
  return row.today;
}

module.exports = { canViewStudent, viewerStudentIds, canViewSection, today, CURRENT_YEAR_SQL };
