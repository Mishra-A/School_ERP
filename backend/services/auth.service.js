const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Per-account brake on guessing: 5 wrong passwords lock that email for 10 minutes (on top of the per-IP limit).
const FAILS = new Map();
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

function assertNotLocked(email) {
  const e = FAILS.get(email);
  if (e && e.until > Date.now()) {
    throw new AppError(`Too many wrong passwords for this account. Try again in ${Math.ceil((e.until - Date.now()) / 60000)} minutes.`, 429);
  }
}
function recordFailure(email) {
  const now = Date.now();
  const e = FAILS.get(email) || { count: 0, until: 0 };
  if (e.until && e.until <= now) { e.count = 0; e.until = 0; }
  e.count += 1;
  if (e.count >= MAX_FAILS) { e.until = now + LOCK_MS; e.count = 0; }
  FAILS.set(email, e);
  if (FAILS.size > 5000) for (const [k, v] of FAILS) if (v.until < now && v.count === 0) FAILS.delete(k);
}

async function authenticate(email, password) {
  assertNotLocked(email);
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.is_active, u.must_change_password, u.email_notifications, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
    [email]
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) { recordFailure(email); throw new AppError('Incorrect email or password.', 401); }
  FAILS.delete(email);
  if (!user.is_active) throw new AppError('This account is inactive. Contact the school office.', 403);

  await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  await logActivity(user.id, 'login', 'user', user.id);
  return { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: Boolean(user.must_change_password), emailNotifications: Boolean(user.email_notifications) };
}

// Profile ids (student_id / teacher_id / parent_id) used by ownership checks and the UI.
async function getProfileIds(user) {
  const tableByRole = { student: 'students', teacher: 'teachers', parent: 'parents' };
  const table = tableByRole[user.role];
  if (!table) return {};
  const [rows] = await pool.query(`SELECT id FROM ${table} WHERE user_id = ?`, [user.id]);
  return rows[0] ? { profileId: rows[0].id } : {};
}

async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw new AppError('Current password is incorrect.', 403);
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, userId]);
  await logActivity(userId, 'password_changed', 'user', userId);
}

async function setEmailNotifications(userId, on) {
  await pool.query('UPDATE users SET email_notifications = ? WHERE id = ?', [on ? 1 : 0, userId]);
}

module.exports = { authenticate, getProfileIds, changePassword, setEmailNotifications, BCRYPT_ROUNDS };
