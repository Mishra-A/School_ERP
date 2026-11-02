const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');

async function list() {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.code, (SELECT COUNT(*) FROM class_subjects cs WHERE cs.subject_id = s.id) AS usage_count
       FROM subjects s ORDER BY s.name`
  );
  return rows;
}

async function create(userId, { name, code }) {
  const [dup] = await pool.query('SELECT id FROM subjects WHERE code = ?', [code]);
  if (dup.length) throw new AppError('A subject with this code already exists.', 409);
  const [res] = await pool.query('INSERT INTO subjects (name, code) VALUES (?, ?)', [name, code]);
  await logActivity(userId, 'subject_created', 'subject', res.insertId);
  return res.insertId;
}

async function update(userId, id, { name, code }) {
  const [dup] = await pool.query('SELECT id FROM subjects WHERE code = ? AND id <> ?', [code, id]);
  if (dup.length) throw new AppError('A subject with this code already exists.', 409);
  const [res] = await pool.query('UPDATE subjects SET name = ?, code = ? WHERE id = ?', [name, code, id]);
  if (!res.affectedRows) throw new AppError('Subject not found.', 404);
  await logActivity(userId, 'subject_updated', 'subject', id);
}

async function remove(userId, id) {
  const [res] = await pool.query('DELETE FROM subjects WHERE id = ?', [id]);
  if (!res.affectedRows) throw new AppError('Subject not found.', 404);
  await logActivity(userId, 'subject_deleted', 'subject', id);
}

module.exports = { list, create, update, remove };
