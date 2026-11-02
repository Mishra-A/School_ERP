require('dotenv').config();
const mysql = require('mysql2/promise');
const { mysqlTlsOptions } = require('./mysqlTls');

const isRender = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_HOSTNAME);
const isProduction = process.env.NODE_ENV === 'production' || isRender;
const dbHost = process.env.DB_HOST || 'localhost';
const localHosts = new Set(['localhost', '::1', '127.0.0.1']);

if (isProduction) {
  if (localHosts.has(dbHost.toLowerCase())) {
    throw new Error('DB_HOST must be the hosted MySQL hostname in production; localhost is development-only.');
  }
  for (const key of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!process.env[key]) throw new Error(`${key} is required in production.`);
  }
}

const portValue = process.env.DB_PORT || '3306';
const dbPort = Number(portValue);
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  throw new Error('DB_PORT must be a valid TCP port.');
}

const dbConfig = {
  host: dbHost,
  port: dbPort,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'school_erp',
};

const pool = mysql.createPool({
  ...dbConfig,
  ...mysqlTlsOptions(),
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // return DATE/DATETIME as plain strings, avoids timezone shifts
  decimalNumbers: true,
});

// Runs fn(conn) inside a transaction; commits on success, rolls back on any error.
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, dbConfig, isRender, isProduction, mysqlTlsOptions, withTransaction };
