// Runs every suite in tests/api against a throwaway database and a throwaway server.
//   npm test               all suites (SQLite by default)
//   npm test -- phase5     only suites whose name contains "phase5"
//   npm test -- --mysql    use a throwaway MySQL database instead
//
// Safety: the SQLite database is always a throwaway temp file, and uploads go to a temp folder.
// The MySQL database used is always "<DB_NAME>_test" (never your real one).

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.TEST_PORT) || 3999;
const REAL_DB = process.env.DB_NAME || 'school_erp';
const TEST_DB = `${REAL_DB.replace(/_test$/, '')}_test`;
const DB_DRIVER = process.argv.includes('--mysql') || process.env.TEST_DB_DRIVER === 'mysql' ? 'mysql' : 'sqlite';
const SQLITE_TEST_PATH = path.join(os.tmpdir(), `school-erp-test-${process.pid}.sqlite`);
const filter = process.argv.slice(2).find((arg) => arg !== '--mysql' && arg !== '--sqlite');

if (DB_DRIVER === 'mysql' && !TEST_DB.endsWith('_test')) { console.error('Refusing to run: test database name must end in _test.'); process.exit(1); }

const suites = fs.readdirSync(path.join(__dirname, 'api')).filter((f) => f.endsWith('.test.js')).sort().filter((f) => !filter || f.includes(filter));
if (!suites.length) { console.error('No test suites match.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function envFor(uploadDir) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('SMTP_')) delete env[k]; // tests must never send real email
  return {
    ...env, NODE_ENV: 'test', DB_DRIVER, SQLITE_PATH: SQLITE_TEST_PATH, PORT: String(PORT), DB_NAME: TEST_DB, UPLOAD_DIR: uploadDir, TEST_RUN: '1',
    TEST_BASE_URL: `http://localhost:${PORT}`, SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
    ADMIN_NAME: 'Test Admin', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'TestPass12345', SCHOOL_NAME: 'Test School',
  };
}

async function resetDatabase() {
  if (DB_DRIVER === 'sqlite') {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${SQLITE_TEST_PATH}${suffix}`, { force: true });
    return;
  }
  const mysql = require('mysql2/promise');
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  });
  try { await c.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``); } finally { await c.end(); }
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tryOnce = () => {
      http.get({ host: 'localhost', port: PORT, path: '/api/auth/me' }, (res) => { res.resume(); resolve(); })
        .on('error', () => (Date.now() - started > 20000 ? reject(new Error('server did not start')) : setTimeout(tryOnce, 250)));
    };
    tryOnce();
  });
}

async function runSuite(file) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-erp-test-'));
  const env = envFor(uploadDir);
  await resetDatabase();
  for (const script of ['database/migrate.js', 'database/seeds/seed.js']) {
    const r = spawnSync(process.execPath, [path.join(ROOT, script)], { env, cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${script} failed: ${r.stderr || r.stdout}`);
  }
  const server = spawn(process.execPath, [path.join(ROOT, 'backend/server.js')], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  try {
    await waitForServer();
    const r = spawnSync(process.execPath, [path.join(__dirname, 'api', file)], { env, cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/passed (\d+), failed (\d+)/);
    return { file, passed: m ? Number(m[1]) : 0, failed: m ? Number(m[2]) : 1, out, ok: r.status === 0 && m && Number(m[2]) === 0, serverLog };
  } finally {
    server.kill();
    await sleep(300);
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

(async () => {
  console.log(`Using ${DB_DRIVER === 'sqlite' ? `temporary SQLite file "${SQLITE_TEST_PATH}"` : `test database "${TEST_DB}"`} on port ${PORT}\n`);
  const results = [];
  for (const file of suites) {
    process.stdout.write(`${file.padEnd(34)}`);
    try {
      const r = await runSuite(file);
      results.push(r);
      console.log(r.ok ? `ok   (${r.passed} checks)` : `FAILED (${r.passed} passed, ${r.failed} failed)`);
      if (!r.ok) console.log(r.out.split('\n').filter((l) => /FAIL|CRASH|Error|passed/.test(l)).map((l) => `    ${l}`).join('\n'));
    } catch (err) {
      results.push({ file, ok: false, passed: 0, failed: 1 });
      console.log(`FAILED to run: ${err.message}`);
    }
  }
  await resetDatabase();
  const total = results.reduce((a, r) => a + r.passed, 0);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed ? `${failed} suite(s) failed` : 'All suites passed'}: ${total} checks passed.`);
  process.exit(failed ? 1 : 0);
})();