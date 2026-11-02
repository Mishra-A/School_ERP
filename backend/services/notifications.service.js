const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const mailer = require('./mailer.service');
const { CURRENT_YEAR_SQL } = require('./access.service');

const unique = (ids) => [...new Set(ids.filter(Boolean))];

// ---------------------------------------------------------------- sending
// userIds: users to notify. Inactive users are skipped. Emails only go to users who haven't opted out.
async function notifyUsers(userIds, { title, message, link = null, email = true }, { excludeUserId = null } = {}) {
  const ids = unique(userIds).filter((id) => id !== excludeUserId);
  if (!ids.length) return 0;
  const [users] = await pool.query('SELECT id, email, email_notifications AS emailOn FROM users WHERE id IN (?) AND is_active = 1', [ids]);
  if (!users.length) return 0;
  const rows = users.map((u) => [u.id, String(title).slice(0, 150), message ? String(message).slice(0, 500) : null, link]);
  for (let i = 0; i < rows.length; i += 500) {
    await pool.query('INSERT INTO notifications (user_id, title, message, link) VALUES ?', [rows.slice(i, i + 500)]);
  }
  if (email) {
    mailer.enqueue(users.filter((u) => u.emailOn).map((u) => ({ to: u.email, subject: title, text: message || title })), link);
  }
  return users.length;
}

// Never lets a notification problem break the action that triggered it.
async function safely(fn) {
  try { return await fn(); } catch (err) { console.error('notification failed:', err.message); return 0; }
}

// ---------------------------------------------------------------- who to tell
async function studentUserIds(studentIds) {
  if (!studentIds.length) return [];
  const [rows] = await pool.query('SELECT user_id AS id FROM students WHERE id IN (?)', [studentIds]);
  return rows.map((r) => r.id);
}
async function parentUserIds(studentIds) {
  if (!studentIds.length) return [];
  const [rows] = await pool.query(
    'SELECT DISTINCT p.user_id AS id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id IN (?)', [studentIds]);
  return rows.map((r) => r.id);
}

// Students and/or their parents.
async function notifyStudents(studentIds, content, { students = true, parents = true, excludeUserId } = {}) {
  const ids = unique(studentIds);
  const users = [...(students ? await studentUserIds(ids) : []), ...(parents ? await parentUserIds(ids) : [])];
  return notifyUsers(users, content, { excludeUserId });
}

async function sectionStudentIds(sectionId) {
  const [rows] = await pool.query(`SELECT student_id AS id FROM student_enrollments WHERE section_id = ? AND academic_year_id = ${CURRENT_YEAR_SQL}`, [sectionId]);
  return rows.map((r) => r.id);
}
async function notifySection(sectionId, content, opts) {
  return notifyStudents(await sectionStudentIds(sectionId), content, opts);
}

async function noticeRecipients(n) {
  const wants = (role) => n.audience === 'all' || n.audience === role;
  const cls = n.class_id;
  const ids = [];
  const classStudentSql = `SELECT se.student_id FROM student_enrollments se JOIN sections s ON s.id = se.section_id WHERE s.class_id = ? AND se.academic_year_id = ${CURRENT_YEAR_SQL}`;
  if (wants('students')) {
    const [r] = cls
      ? await pool.query(`SELECT u.id FROM students st JOIN users u ON u.id = st.user_id WHERE st.id IN (${classStudentSql})`, [cls])
      : await pool.query('SELECT user_id AS id FROM students');
    ids.push(...r.map((x) => x.id));
  }
  if (wants('parents')) {
    const [r] = cls
      ? await pool.query(`SELECT DISTINCT p.user_id AS id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id IN (${classStudentSql})`, [cls])
      : await pool.query('SELECT user_id AS id FROM parents');
    ids.push(...r.map((x) => x.id));
  }
  if (wants('teachers')) {
    const [r] = cls
      ? await pool.query(
        `SELECT u.id FROM teachers t JOIN users u ON u.id = t.user_id
          WHERE t.id IN (SELECT cs.teacher_id FROM class_subjects cs JOIN sections s ON s.id = cs.section_id WHERE s.class_id = ?)
             OR t.id IN (SELECT class_teacher_id FROM sections WHERE class_id = ? AND class_teacher_id IS NOT NULL)`, [cls, cls])
      : await pool.query('SELECT user_id AS id FROM teachers');
    ids.push(...r.map((x) => x.id));
  }
  return ids;
}

// Announces every published notice that hasn't been announced yet (scheduled ones go out on their publish date).
// The UPDATE claims each notice, so it is announced exactly once even if two processes run this together.
async function notifyDueNotices() {
  const [due] = await pool.query('SELECT id, title, description, audience, class_id, created_by FROM notices WHERE notified_at IS NULL AND publish_date <= CURDATE() ORDER BY id LIMIT 50');
  let count = 0;
  for (const n of due) {
    const [claim] = await pool.query('UPDATE notices SET notified_at = NOW() WHERE id = ? AND notified_at IS NULL', [n.id]);
    if (!claim.affectedRows) continue;
    count += await notifyUsers(await noticeRecipients(n), { title: `Notice: ${n.title}`, message: n.description.slice(0, 200), link: '/pages/notices.html' }, { excludeUserId: n.created_by });
  }
  return count;
}

// ---------------------------------------------------------------- reading (own notifications only)
async function list(user, { unreadOnly, page, limit, offset }) {
  const where = `user_id = ?${unreadOnly ? ' AND is_read = 0' : ''}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notifications WHERE ${where}`, [user.id]);
  const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [user.id]);
  const [rows] = await pool.query(
    `SELECT id, title, message, link, is_read AS isRead, created_at AS createdAt FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [user.id, limit, offset]);
  return { rows: rows.map((r) => ({ ...r, isRead: Boolean(r.isRead) })), total, unread, page, limit };
}

async function unreadCount(user) {
  const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [user.id]);
  return unread;
}

async function markRead(user, id) {
  const [r] = await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, user.id]);
  if (!r.affectedRows) throw new AppError('Notification not found.', 404);
}

async function markAllRead(user) {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [user.id]);
}

// Housekeeping: read ones after 60 days, anything after 180.
async function cleanup() {
  const [r] = await pool.query('DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY) OR (is_read = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 60 DAY))');
  return r.affectedRows;
}

module.exports = { notifyUsers, notifyStudents, notifySection, notifyDueNotices, safely, list, unreadCount, markRead, markAllRead, cleanup };
