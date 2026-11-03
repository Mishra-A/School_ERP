async function sql(query, params = []) {
  if (process.env.DB_DRIVER === 'sqlite') {
    const { pool } = require('../../backend/config/db');
    const [rows] = await pool.query(query, params);
    return rows;
  }

  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [rows] = await connection.query(query, params);
    return rows;
  } finally {
    await connection.end();
  }
}

async function columnExists(table, column) {
  if (!/^[a-z_]+$/i.test(table)) throw new Error('Invalid table name.');
  if (!/^[a-z_]+$/i.test(column)) throw new Error('Invalid column name.');
  if (process.env.DB_DRIVER === 'sqlite') {
    const columns = await sql(`PRAGMA table_info(${table})`);
    return columns.some((item) => item.name === column);
  }
  const [result] = await sql(
    'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]
  );
  return Number(result.n) > 0;
}

module.exports = { sql, columnExists };