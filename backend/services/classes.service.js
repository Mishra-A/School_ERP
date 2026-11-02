const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');
const years = require('./academicYears.service');

async function resolveYearId(yearId) {
  if (yearId) return yearId;
  const cur = await years.currentYear();
  return cur ? cur.id : null;
}

// Classes for a year, each with its sections (student + subject counts).
async function listWithSections(yearId) {
  const id = await resolveYearId(yearId);
  if (!id) return { yearId: null, classes: [] };

  const [classes] = await pool.query('SELECT id, name FROM classes WHERE academic_year_id = ? ORDER BY name', [id]);
  const [sections] = await pool.query(
    `SELECT s.id, s.class_id, s.name, s.class_teacher_id, u.name AS class_teacher_name,
            (SELECT COUNT(*) FROM student_enrollments se WHERE se.section_id = s.id) AS student_count,
            (SELECT COUNT(*) FROM class_subjects cs WHERE cs.section_id = s.id) AS subject_count
       FROM sections s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN teachers t ON t.id = s.class_teacher_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE c.academic_year_id = ? ORDER BY s.name`,
    [id]
  );
  return {
    yearId: id,
    classes: classes.map((c) => ({ ...c, sections: sections.filter((s) => s.class_id === c.id) })),
  };
}

// Flat "Class 5 - A" list used by dropdowns.
async function sectionOptions(yearId) {
  const id = await resolveYearId(yearId);
  if (!id) return [];
  const [rows] = await pool.query(
    `SELECT s.id, s.name AS section_name, c.id AS class_id, c.name AS class_name
       FROM sections s JOIN classes c ON c.id = s.class_id
      WHERE c.academic_year_id = ? ORDER BY c.name, s.name`,
    [id]
  );
  return rows.map((r) => ({ ...r, label: `${r.class_name} - ${r.section_name}` }));
}

async function createClass(userId, { academic_year_id, name }) {
  const [dup] = await pool.query('SELECT id FROM classes WHERE academic_year_id = ? AND name = ?', [academic_year_id, name]);
  if (dup.length) throw new AppError('This class already exists in that academic year.', 409);
  const [res] = await pool.query('INSERT INTO classes (academic_year_id, name) VALUES (?, ?)', [academic_year_id, name]);
  await logActivity(userId, 'class_created', 'class', res.insertId);
  return res.insertId;
}

async function updateClass(userId, id, { name }) {
  const [rows] = await pool.query('SELECT academic_year_id FROM classes WHERE id = ?', [id]);
  if (!rows[0]) throw new AppError('Class not found.', 404);
  const [dup] = await pool.query('SELECT id FROM classes WHERE academic_year_id = ? AND name = ? AND id <> ?', [rows[0].academic_year_id, name, id]);
  if (dup.length) throw new AppError('This class already exists in that academic year.', 409);
  await pool.query('UPDATE classes SET name = ? WHERE id = ?', [name, id]);
  await logActivity(userId, 'class_updated', 'class', id);
}

async function deleteClass(userId, id) {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM sections WHERE class_id = ?', [id]);
  if (n > 0) throw new AppError('This class still has sections. Delete them first.', 409);
  const [res] = await pool.query('DELETE FROM classes WHERE id = ?', [id]);
  if (!res.affectedRows) throw new AppError('Class not found.', 404);
  await logActivity(userId, 'class_deleted', 'class', id);
}

async function assertActiveTeacher(teacherId) {
  if (!teacherId) return;
  const [rows] = await pool.query('SELECT t.id FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND u.is_active = 1', [teacherId]);
  if (!rows[0]) throw new AppError('Selected teacher was not found or is inactive.', 422);
}

async function createSection(userId, classId, { name, class_teacher_id }) {
  const [cls] = await pool.query('SELECT id FROM classes WHERE id = ?', [classId]);
  if (!cls[0]) throw new AppError('Class not found.', 404);
  await assertActiveTeacher(class_teacher_id);
  const [dup] = await pool.query('SELECT id FROM sections WHERE class_id = ? AND name = ?', [classId, name]);
  if (dup.length) throw new AppError('This section already exists in the class.', 409);
  const [res] = await pool.query('INSERT INTO sections (class_id, name, class_teacher_id) VALUES (?, ?, ?)', [classId, name, class_teacher_id]);
  await logActivity(userId, 'section_created', 'section', res.insertId);
  return res.insertId;
}

async function updateSection(userId, id, { name, class_teacher_id }) {
  const [rows] = await pool.query('SELECT class_id FROM sections WHERE id = ?', [id]);
  if (!rows[0]) throw new AppError('Section not found.', 404);
  await assertActiveTeacher(class_teacher_id);
  const [dup] = await pool.query('SELECT id FROM sections WHERE class_id = ? AND name = ? AND id <> ?', [rows[0].class_id, name, id]);
  if (dup.length) throw new AppError('This section already exists in the class.', 409);
  await pool.query('UPDATE sections SET name = ?, class_teacher_id = ? WHERE id = ?', [name, class_teacher_id, id]);
  await logActivity(userId, 'section_updated', 'section', id);
}

async function deleteSection(userId, id) {
  const [[{ students }]] = await pool.query('SELECT COUNT(*) AS students FROM student_enrollments WHERE section_id = ?', [id]);
  if (students > 0) throw new AppError('Students are enrolled in this section. Move them first.', 409);
  await pool.query('DELETE FROM class_subjects WHERE section_id = ?', [id]); // unreferenced assignments only; FKs block the rest
  const [res] = await pool.query('DELETE FROM sections WHERE id = ?', [id]);
  if (!res.affectedRows) throw new AppError('Section not found.', 404);
  await logActivity(userId, 'section_deleted', 'section', id);
}

// Subject + teacher assignments for a section.
async function listAssignments(sectionId) {
  const [rows] = await pool.query(
    `SELECT cs.id, cs.subject_id, sub.name AS subject_name, sub.code AS subject_code, cs.teacher_id, u.name AS teacher_name
       FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN teachers t ON t.id = cs.teacher_id
       JOIN users u ON u.id = t.user_id
      WHERE cs.section_id = ? ORDER BY sub.name`,
    [sectionId]
  );
  return rows;
}

async function addAssignment(userId, sectionId, { subject_id, teacher_id }) {
  const [sec] = await pool.query('SELECT id FROM sections WHERE id = ?', [sectionId]);
  if (!sec[0]) throw new AppError('Section not found.', 404);
  await assertActiveTeacher(teacher_id);
  const [dup] = await pool.query('SELECT id FROM class_subjects WHERE section_id = ? AND subject_id = ?', [sectionId, subject_id]);
  if (dup.length) throw new AppError('This subject is already assigned to the section. Change its teacher instead.', 409);
  const [res] = await pool.query('INSERT INTO class_subjects (section_id, subject_id, teacher_id) VALUES (?, ?, ?)', [sectionId, subject_id, teacher_id]);
  await logActivity(userId, 'subject_assigned', 'class_subject', res.insertId);
  return res.insertId;
}

async function changeAssignmentTeacher(userId, id, teacherId) {
  await assertActiveTeacher(teacherId);
  const [res] = await pool.query('UPDATE class_subjects SET teacher_id = ? WHERE id = ?', [teacherId, id]);
  if (!res.affectedRows) throw new AppError('Assignment not found.', 404);
  await logActivity(userId, 'subject_teacher_changed', 'class_subject', id);
}

async function removeAssignment(userId, id) {
  const [res] = await pool.query('DELETE FROM class_subjects WHERE id = ?', [id]); // blocked by FK if homework/materials exist
  if (!res.affectedRows) throw new AppError('Assignment not found.', 404);
  await logActivity(userId, 'subject_unassigned', 'class_subject', id);
}

module.exports = {
  listWithSections, sectionOptions, createClass, updateClass, deleteClass, createSection, updateSection,
  deleteSection, listAssignments, addAssignment, changeAssignmentTeacher, removeAssignment,
};
