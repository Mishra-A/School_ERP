const { pool } = require('../config/db');

// Best-effort audit trail; never blocks or fails the main request.
async function logActivity(userId, action, entity = null, entityId = null) {
  try {
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)',
      [userId, action, entity, entityId]
    );
  } catch (err) {
    console.error('activity log failed:', err.message);
  }
}
module.exports = { logActivity };
