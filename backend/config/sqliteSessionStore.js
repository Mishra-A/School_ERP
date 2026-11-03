const session = require('express-session');

class SqliteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.database = database;
    database.exec(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires);
    `);
    this.getStatement = database.prepare('SELECT sess, expires FROM app_sessions WHERE sid = ?');
    this.setStatement = database.prepare(`
      INSERT INTO app_sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `);
    this.destroyStatement = database.prepare('DELETE FROM app_sessions WHERE sid = ?');
    this.cleanupStatement = database.prepare('DELETE FROM app_sessions WHERE expires <= ?');
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        this.destroyStatement.run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expiresAt = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 24 * 60 * 60 * 1000;
      this.setStatement.run(sid, JSON.stringify(sess), expiresAt);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    this.set(sid, sess, callback);
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStatement.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  clearExpired(callback = () => {}) {
    try {
      this.cleanupStatement.run(Date.now());
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = SqliteSessionStore;