const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { likeTerm } = require('../utils/validate');
const people = require('./people.service');
const { logActivity } = require('../utils/activityLog');

const SELECT = `SELECT t.id, u.name, u.email, u.is_active AS isActive, t.employee_code AS employeeCode, t.phone,
                       t.qualification, t.joined_on AS joinedOn
                  FROM teachers t JOIN users u ON u.id = t.user_id`;

async function list({ search, status, page, limit, offset }) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR t.employee_code LIKE ?)');
    const term = likeTerm(search);
    params.push(term, term, term);
  }
  if (status === 'active') where.push('u.is_active = 1');
  if (status === 'inactive') where.push('u.is_active = 0');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM teachers t JOIN users u ON u.id = t.user_id ${clause}`, params);
  const [rows] = await pool.query(`${SELECT} ${clause} ORDER BY u.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { rows: rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) })), total, page, limit };
}

async function get(id) {
  const [rows] = await pool.query(`${SELECT} WHERE t.id = ?`, [id]);
  if (!rows[0]) throw new AppError('Teacher not found.', 404);
  return { ...rows[0], isActive: Boolean(rows[0].isActive) };
}

async function options() {
  const [rows] = await pool.query(`SELECT t.id, u.name FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.is_active = 1 ORDER BY u.name`);
  return rows;
}

async function create(actorId, d) {
  const result = await withTransaction(async (conn) => {
    const { userId, temporaryPassword } = await people.createUserRow(conn, 'teacher', d.name, d.email);
    const [r] = await conn.query(
      'INSERT INTO teachers (user_id, employee_code, phone, qualification, joined_on) VALUES (?, ?, ?, ?, ?)',
      [userId, d.employeeCode, d.phone, d.qualification, d.joinedOn]
    );
    return { id: r.insertId, name: d.name, email: d.email, temporaryPassword };
  });
  await logActivity(actorId, 'teacher_created', 'teacher', result.id);
  return result;
}

async function update(actorId, id, d) {
  await withTransaction(async (conn) => {
    await people.updateUserRow(conn, 'teacher', id, d.name, d.email);
    await conn.query('UPDATE teachers SET employee_code = ?, phone = ?, qualification = ?, joined_on = ? WHERE id = ?',
      [d.employeeCode, d.phone, d.qualification, d.joinedOn, id]);
  });
  await logActivity(actorId, 'teacher_updated', 'teacher', id);
}

module.exports = { list, get, options, create, update };
