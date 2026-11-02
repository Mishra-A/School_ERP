const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');

async function currentYear() {
  const [rows] = await pool.query('SELECT * FROM academic_years WHERE is_current = 1 ORDER BY start_date DESC LIMIT 1');
  return rows[0] || null;
}

async function list() {
  const [rows] = await pool.query(
    `SELECT y.*, (SELECT COUNT(*) FROM classes c WHERE c.academic_year_id = y.id) AS class_count
       FROM academic_years y ORDER BY y.start_date DESC`
  );
  return rows;
}

async function create(userId, data) {
  if (data.end_date <= data.start_date) throw new AppError('End date must be after the start date.', 422);
  return withTransaction(async (conn) => {
    const [dup] = await conn.query('SELECT id FROM academic_years WHERE name = ?', [data.name]);
    if (dup.length) throw new AppError('An academic year with this name already exists.', 409);
    if (data.is_current) await conn.query('UPDATE academic_years SET is_current = 0');
    const [res] = await conn.query(
      'INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES (?, ?, ?, ?)',
      [data.name, data.start_date, data.end_date, data.is_current ? 1 : 0]
    );
    await logActivity(userId, 'academic_year_created', 'academic_year', res.insertId);
    return res.insertId;
  });
}

async function update(userId, id, data) {
  if (data.end_date <= data.start_date) throw new AppError('End date must be after the start date.', 422);
  const [dup] = await pool.query('SELECT id FROM academic_years WHERE name = ? AND id <> ?', [data.name, id]);
  if (dup.length) throw new AppError('An academic year with this name already exists.', 409);
  const [res] = await pool.query(
    'UPDATE academic_years SET name = ?, start_date = ?, end_date = ? WHERE id = ?',
    [data.name, data.start_date, data.end_date, id]
  );
  if (!res.affectedRows) throw new AppError('Academic year not found.', 404);
  await logActivity(userId, 'academic_year_updated', 'academic_year', id);
}

async function setCurrent(userId, id) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM academic_years WHERE id = ?', [id]);
    if (!rows[0]) throw new AppError('Academic year not found.', 404);
    await conn.query('UPDATE academic_years SET is_current = 0');
    await conn.query('UPDATE academic_years SET is_current = 1 WHERE id = ?', [id]);
  });
  await logActivity(userId, 'academic_year_set_current', 'academic_year', id);
}

async function remove(userId, id) {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM classes WHERE academic_year_id = ?', [id]);
  if (n > 0) throw new AppError('This year has classes. Delete or move them first.', 409);
  const [res] = await pool.query('DELETE FROM academic_years WHERE id = ?', [id]);
  if (!res.affectedRows) throw new AppError('Academic year not found.', 404);
  await logActivity(userId, 'academic_year_deleted', 'academic_year', id);
}

module.exports = { currentYear, list, create, update, setCurrent, remove };
