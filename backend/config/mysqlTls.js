function mysqlTlsOptions(env = process.env) {
  if (!['1', 'true', 'require'].includes(String(env.DB_SSL || '').toLowerCase())) return {};
  return { ssl: { rejectUnauthorized: true } };
}

module.exports = { mysqlTlsOptions };