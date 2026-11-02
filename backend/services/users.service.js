const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { generateTempPassword, hashPassword } = require('../utils/credentials');
const { logActivity } = require('../utils/activityLog');

// conn can be a pool or a transaction connection.
async function createUser(conn, { role, name, email }) {
  const [dup] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
  if (dup.length) throw new AppError('A user with this email already exists.', 409);

  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  const [res] = await conn.query(
    'INSERT INTO users (role_id, name, email, password_hash) VALUES ((SELECT id FROM roles WHERE name = ?), ?, ?, ?)',
    [role, name, email, hash]
  );
  return { userId: res.insertId, tempPassword };
}

async function updateUserBasics(conn, userId, { name, email }) {
  const [dup] = await conn.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, userId]);
  if (dup.length) throw new AppError('A user with this email already exists.', 409);
  await conn.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, userId]);
}

async function resetPassword(adminId, userId) {
  const [rows] = await pool.query('SELECT id, name FROM users WHERE id = ?', [userId]);
  if (!rows[0]) throw new AppError('User not found.', 404);
  const tempPassword = generateTempPassword();
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(tempPassword), userId]);
  await logActivity(adminId, 'password_reset', 'user', userId);
  return { tempPassword, name: rows[0].name };
}

async function setStatus(adminId, userId, isActive) {
  if (adminId === userId) throw new AppError('You cannot deactivate your own account.', 400);
  const [res] = await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, userId]);
  if (!res.affectedRows) throw new AppError('User not found.', 404);
  await logActivity(adminId, isActive ? 'user_activated' : 'user_deactivated', 'user', userId);
}

module.exports = { createUser, updateUserBasics, resetPassword, setStatus };
