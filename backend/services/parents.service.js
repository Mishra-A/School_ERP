const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { likeTerm } = require('../utils/validate');
const people = require('./people.service');
const { logActivity } = require('../utils/activityLog');

const SELECT = `SELECT p.id, u.name, u.email, u.is_active AS isActive, p.phone, p.occupation,
                       (SELECT GROUP_CONCAT(cu.name ORDER BY cu.name SEPARATOR ', ')
                          FROM parent_students ps JOIN students s ON s.id = ps.student_id JOIN users cu ON cu.id = s.user_id
                         WHERE ps.parent_id = p.id) AS children
                  FROM parents p JOIN users u ON u.id = p.user_id`;

async function list({ search, status, page, limit, offset }) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR p.phone LIKE ?)');
    const term = likeTerm(search);
    params.push(term, term, term);
  }
  if (status === 'active') where.push('u.is_active = 1');
  if (status === 'inactive') where.push('u.is_active = 0');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM parents p JOIN users u ON u.id = p.user_id ${clause}`, params);
  const [rows] = await pool.query(`${SELECT} ${clause} ORDER BY u.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { rows: rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) })), total, page, limit };
}

async function get(id) {
  const [rows] = await pool.query(`${SELECT} WHERE p.id = ?`, [id]);
  if (!rows[0]) throw new AppError('Parent not found.', 404);
  return { ...rows[0], isActive: Boolean(rows[0].isActive) };
}

async function options() {
  const [rows] = await pool.query(`SELECT p.id, CONCAT(u.name, IFNULL(CONCAT(' (', p.phone, ')'), '')) AS name
                                     FROM parents p JOIN users u ON u.id = p.user_id WHERE u.is_active = 1 ORDER BY u.name`);
  return rows;
}

async function create(actorId, d) {
  const result = await withTransaction(async (conn) => {
    const { userId, temporaryPassword } = await people.createUserRow(conn, 'parent', d.name, d.email);
    const [r] = await conn.query('INSERT INTO parents (user_id, phone, occupation) VALUES (?, ?, ?)', [userId, d.phone, d.occupation]);
    return { id: r.insertId, name: d.name, email: d.email, temporaryPassword };
  });
  await logActivity(actorId, 'parent_created', 'parent', result.id);
  return result;
}

async function update(actorId, id, d) {
  await withTransaction(async (conn) => {
    await people.updateUserRow(conn, 'parent', id, d.name, d.email);
    await conn.query('UPDATE parents SET phone = ?, occupation = ? WHERE id = ?', [d.phone, d.occupation, id]);
  });
  await logActivity(actorId, 'parent_updated', 'parent', id);
}

module.exports = { list, get, options, create, update };
