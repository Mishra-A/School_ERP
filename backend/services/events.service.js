const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { logActivity } = require('../utils/activityLog');

const SELECT = `SELECT e.id, e.title, e.description, e.event_type AS eventType, e.start_date AS startDate, e.end_date AS endDate FROM events e`;

// scope: upcoming (default) = not yet over, soonest first; past = already over, newest first.
async function list({ scope, type }) {
  const where = [];
  const params = [];
  if (type) { where.push('e.event_type = ?'); params.push(type); }
  if (scope === 'past') where.push('COALESCE(e.end_date, e.start_date) < CURDATE()');
  else where.push('COALESCE(e.end_date, e.start_date) >= CURDATE()');
  const order = scope === 'past' ? 'ORDER BY e.start_date DESC LIMIT 150' : 'ORDER BY e.start_date, e.id LIMIT 300';
  const [rows] = await pool.query(`${SELECT} WHERE ${where.join(' AND ')} ${order}`, params);
  return rows;
}

async function create(actorId, d) {
  const [r] = await pool.query('INSERT INTO events (title, description, event_type, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [d.title, d.description, d.eventType, d.startDate, d.endDate, actorId]);
  await logActivity(actorId, 'event_created', 'event', r.insertId);
  return { id: r.insertId };
}

async function update(actorId, id, d) {
  const [r] = await pool.query('UPDATE events SET title = ?, description = ?, event_type = ?, start_date = ?, end_date = ? WHERE id = ?',
    [d.title, d.description, d.eventType, d.startDate, d.endDate, id]);
  if (!r.affectedRows) throw new AppError('Event not found.', 404);
  await logActivity(actorId, 'event_updated', 'event', id);
}

async function remove(actorId, id) {
  const [r] = await pool.query('DELETE FROM events WHERE id = ?', [id]);
  if (!r.affectedRows) throw new AppError('Event not found.', 404);
  await logActivity(actorId, 'event_deleted', 'event', id);
}

module.exports = { list, create, update, remove };
