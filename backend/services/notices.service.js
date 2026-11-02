const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const files = require('./files.service');
const { viewerStudentIds, today, CURRENT_YEAR_SQL } = require('./access.service');
const { logActivity } = require('../utils/activityLog');
const notifications = require('./notifications.service');

const TEACHER_CLASSES = `SELECT s.class_id FROM class_subjects cs JOIN sections s ON s.id = cs.section_id WHERE cs.teacher_id = ?
                         UNION SELECT class_id FROM sections WHERE class_teacher_id = ?`;

// Who may see which notice. Admin sees everything; everyone else only notices that are published,
// addressed to their role, and either school-wide or for their own class. A teacher also always sees their own.
async function visibility(user) {
  if (user.role === 'admin') return { sql: '1 = 1', params: [] };
  if (user.role === 'teacher') {
    const t = user.profileId || 0;
    return {
      sql: `(n.created_by = ? OR (n.publish_date <= CURDATE() AND n.audience IN ('all','teachers') AND (n.class_id IS NULL OR n.class_id IN (${TEACHER_CLASSES}))))`,
      params: [user.id, t, t],
    };
  }
  const ids = await viewerStudentIds(user);
  let classIds = [];
  if (ids.length) {
    const [rows] = await pool.query(
      `SELECT DISTINCT s.class_id AS id FROM student_enrollments se JOIN sections s ON s.id = se.section_id
        WHERE se.student_id IN (?) AND se.academic_year_id = ${CURRENT_YEAR_SQL}`, [ids]);
    classIds = rows.map((r) => r.id);
  }
  const audience = user.role === 'student' ? 'students' : 'parents';
  return {
    sql: `(n.publish_date <= CURDATE() AND n.audience IN ('all', ?) AND (n.class_id IS NULL${classIds.length ? ' OR n.class_id IN (?)' : ''}))`,
    params: classIds.length ? [audience, classIds] : [audience],
  };
}

const COLUMNS = `n.id, n.title, n.description, n.audience, n.class_id AS classId, c.name AS className, n.publish_date AS publishDate,
                 (n.attachment_path IS NOT NULL) AS hasAttachment, n.created_by AS createdBy, u.name AS createdByName, (n.publish_date > CURDATE()) AS scheduled`;
const FROM = 'FROM notices n JOIN users u ON u.id = n.created_by LEFT JOIN classes c ON c.id = n.class_id';

function shape(user, r) {
  return { ...r, hasAttachment: Boolean(r.hasAttachment), scheduled: Boolean(r.scheduled), canEdit: user.role === 'admin' || r.createdBy === user.id };
}

async function list(user, { page, limit, offset }) {
  const v = await visibility(user);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notices n WHERE ${v.sql}`, v.params);
  const [rows] = await pool.query(`SELECT ${COLUMNS} ${FROM} WHERE ${v.sql} ORDER BY n.publish_date DESC, n.id DESC LIMIT ? OFFSET ?`, [...v.params, limit, offset]);
  return { rows: rows.map((r) => shape(user, r)), total, page, limit };
}

async function getVisible(user, id) {
  const v = await visibility(user);
  const [rows] = await pool.query(`SELECT ${COLUMNS}, n.attachment_path AS attachmentPath ${FROM} WHERE n.id = ? AND ${v.sql}`, [id, ...v.params]);
  if (!rows[0]) throw new AppError('Notice not found.', 404);
  return rows[0];
}

async function teacherMayTarget(user, classId) {
  const [rows] = await pool.query(`SELECT 1 FROM (${TEACHER_CLASSES}) t WHERE t.class_id = ?`, [user.profileId || 0, user.profileId || 0, classId]);
  return rows.length > 0;
}

async function checkTarget(user, d) {
  if (d.classId) {
    const [[c]] = await pool.query('SELECT id FROM classes WHERE id = ?', [d.classId]);
    if (!c) throw new AppError('Class not found.', 404);
  }
  if (user.role === 'teacher') {
    if (!d.classId) throw new AppError('Choose one of your classes. Only the office can send school-wide notices.', 403);
    if (d.audience === 'teachers') throw new AppError('Teachers can send notices to students and parents of their classes.', 403);
    if (!(await teacherMayTarget(user, d.classId))) throw new AppError("You can only send notices to classes you teach.", 403);
  }
}

async function create(user, d, file) {
  await checkTarget(user, d);
  const date = d.publishDate || (await today());
  const [r] = await pool.query(
    'INSERT INTO notices (title, description, audience, class_id, attachment_path, publish_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [d.title, d.description, d.audience, d.classId, file ? file.filename : null, date, user.id]);
  await logActivity(user.id, 'notice_created', 'notice', r.insertId);
  await notifications.safely(() => notifications.notifyDueNotices()); // also sweeps any scheduled notice that has become due
  return { id: r.insertId };
}

async function loadOwn(user, id) {
  const [[n]] = await pool.query('SELECT id, created_by AS createdBy, attachment_path AS attachmentPath FROM notices WHERE id = ?', [id]);
  if (!n) throw new AppError('Notice not found.', 404);
  if (user.role !== 'admin' && n.createdBy !== user.id) throw new AppError('You can only change your own notices.', 403);
  return n;
}

async function update(user, id, d, file) {
  const n = await loadOwn(user, id);
  await checkTarget(user, d);
  const date = d.publishDate || (await today());
  await pool.query('UPDATE notices SET title = ?, description = ?, audience = ?, class_id = ?, publish_date = ?, attachment_path = ? WHERE id = ?',
    [d.title, d.description, d.audience, d.classId, date, file ? file.filename : n.attachmentPath, id]);
  if (file && n.attachmentPath) files.remove(n.attachmentPath);
  await logActivity(user.id, 'notice_updated', 'notice', id);
}

async function remove(user, id) {
  const n = await loadOwn(user, id);
  await pool.query('DELETE FROM notices WHERE id = ?', [id]);
  files.remove(n.attachmentPath);
  await logActivity(user.id, 'notice_deleted', 'notice', id);
}

async function attachment(user, id) {
  const n = await getVisible(user, id);
  if (!n.attachmentPath) throw new AppError('This notice has no attachment.', 404);
  return { stored: n.attachmentPath, title: n.title };
}

// Classes a user may target with a notice (current year): all for admin, their own for a teacher.
async function targetClasses(user) {
  const params = [];
  let filter = '';
  if (user.role === 'teacher') { filter = `AND c.id IN (${TEACHER_CLASSES})`; params.push(user.profileId || 0, user.profileId || 0); }
  const [rows] = await pool.query(`SELECT c.id, c.name FROM classes c WHERE c.academic_year_id = ${CURRENT_YEAR_SQL} ${filter} ORDER BY c.name`, params);
  return rows;
}

module.exports = { list, create, update, remove, attachment, targetClasses };
