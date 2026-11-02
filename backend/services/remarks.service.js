const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { canViewStudent } = require('./access.service');
const { logActivity } = require('../utils/activityLog');
const notifications = require('./notifications.service');

async function list(user, studentId) {
  if (!(await canViewStudent(user, studentId))) throw new AppError("You don't have access to this student.", 403);
  const [rows] = await pool.query(
    `SELECT r.id, r.remark, r.created_at AS createdAt, r.teacher_id AS teacherId, u.name AS teacherName
       FROM teacher_remarks r JOIN teachers t ON t.id = r.teacher_id JOIN users u ON u.id = t.user_id
      WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 100`, [studentId]);
  return rows.map((r) => ({ ...r, canDelete: user.role === 'admin' || (user.role === 'teacher' && r.teacherId === user.profileId) }));
}

// Only teachers write remarks (each is stored against the teacher who wrote it); canViewStudent limits them to their own students.
async function create(user, { studentId, remark }) {
  if (user.role !== 'teacher' || !user.profileId) throw new AppError('Only teachers can add remarks.', 403);
  if (!(await canViewStudent(user, studentId))) throw new AppError("You can only add remarks for students you teach.", 403);
  const [r] = await pool.query('INSERT INTO teacher_remarks (student_id, teacher_id, remark) VALUES (?, ?, ?)', [studentId, user.profileId, remark]);
  await logActivity(user.id, 'remark_added', 'student', studentId);
  await notifications.safely(() => notifications.notifyStudents([studentId],
    { title: `New remark from ${user.name}`, message: remark.slice(0, 200), link: `/pages/student.html?id=${studentId}`, email: false }, { excludeUserId: user.id }));
  return { id: r.insertId };
}

async function remove(user, id) {
  const [[row]] = await pool.query('SELECT id, teacher_id AS teacherId, student_id AS studentId FROM teacher_remarks WHERE id = ?', [id]);
  if (!row) throw new AppError('Remark not found.', 404);
  if (!(user.role === 'admin' || (user.role === 'teacher' && row.teacherId === user.profileId))) throw new AppError('You can only delete your own remarks.', 403);
  await pool.query('DELETE FROM teacher_remarks WHERE id = ?', [id]);
  await logActivity(user.id, 'remark_deleted', 'student', row.studentId);
}

module.exports = { list, create, remove };
