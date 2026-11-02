const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { BCRYPT_ROUNDS } = require('./auth.service');
const { logActivity } = require('../utils/activityLog');

// Table names are interpolated into SQL, so only ever take them from this whitelist.
const PROFILE_TABLES = { teacher: 'teachers', student: 'students', parent: 'parents' };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generatePassword(length = 10) {
  return Array.from(crypto.randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Creates the login row for a new teacher/student/parent with a one-time temporary password.
async function createUserRow(conn, role, name, email) {
  const temporaryPassword = generatePassword();
  const hash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
  const [result] = await conn.query(
    'INSERT INTO users (role_id, name, email, password_hash, must_change_password) VALUES ((SELECT id FROM roles WHERE name = ?), ?, ?, ?, 1)',
    [role, name, email, hash]
  );
  return { userId: result.insertId, temporaryPassword };
}

async function getUserId(connOrPool, role, profileId) {
  const [rows] = await connOrPool.query(`SELECT user_id FROM ${PROFILE_TABLES[role]} WHERE id = ?`, [profileId]);
  if (!rows[0]) throw new AppError(`${role[0].toUpperCase()}${role.slice(1)} not found.`, 404);
  return rows[0].user_id;
}

async function updateUserRow(conn, role, profileId, name, email) {
  const userId = await getUserId(conn, role, profileId);
  await conn.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, userId]);
}

async function setActive(actorId, role, profileId, active) {
  const userId = await getUserId(pool, role, profileId);
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, userId]);
  await logActivity(actorId, active ? `${role}_activated` : `${role}_deactivated`, role, profileId);
}

async function resetPassword(actorId, role, profileId) {
  const userId = await getUserId(pool, role, profileId);
  const temporaryPassword = generatePassword();
  const hash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, userId]);
  const [[user]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [userId]);
  await logActivity(actorId, `${role}_password_reset`, role, profileId);
  return { name: user.name, email: user.email, temporaryPassword };
}

module.exports = { createUserRow, updateUserRow, setActive, resetPassword, generatePassword };
