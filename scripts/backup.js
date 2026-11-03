// npm run backup  ->  backups/backup-YYYY-MM-DD-HHMMSS/{database.sql, uploads/}
// Needs the "mysqldump" program that comes with MySQL/XAMPP. If it is not on your PATH, set MYSQLDUMP_PATH in .env
// (XAMPP default: C:\xampp\mysql\bin\mysqldump.exe).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pool, dbDriver } = require('../backend/config/db');

const ROOT = path.join(__dirname, '..');
const stamp = new Date().toISOString().replace('T', '-').replace(/:/g, '').slice(0, 17);
const dest = path.join(ROOT, 'backups', `backup-${stamp}`);
const uploads = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'backend', 'uploads'));

const candidates = [process.env.MYSQLDUMP_PATH, 'mysqldump', 'mariadb-dump', 'C:\\xampp\\mysql\\bin\\mysqldump.exe'].filter(Boolean);

function dump(bin) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(path.join(dest, 'database.sql'));
    const args = ['--host', process.env.DB_HOST || 'localhost', '--port', String(process.env.DB_PORT || 3306), '--user', process.env.DB_USER || 'root',
      '--single-transaction', '--routines', '--default-character-set=utf8mb4', process.env.DB_NAME || 'school_erp'];
    // The password goes through the environment, not the command line, so it isn't visible in the process list.
    const child = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stdout.pipe(out);
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `mysqldump exited with code ${code}`))));
  });
}

async function dumpMysql() {
  let lastError;
  let done = false;
  for (const bin of candidates) {
    try { await dump(bin); done = true; break; } catch (e) { lastError = e; if (e.code !== 'ENOENT') break; }
  }
  if (!done) {
    throw new Error(lastError && lastError.code === 'ENOENT'
      ? 'Could not find mysqldump. Set MYSQLDUMP_PATH in .env (XAMPP: C:\\xampp\\mysql\\bin\\mysqldump.exe).'
      : `Database backup failed: ${lastError.message}`);
  }
  return path.join(dest, 'database.sql');
}

(async () => {
  fs.mkdirSync(dest, { recursive: true });
  let databaseBackup;
  if (dbDriver === 'sqlite') {
    databaseBackup = path.join(dest, 'database.sqlite');
    await pool.database.backup(databaseBackup);
  } else {
    databaseBackup = await dumpMysql();
  }
  let files = 0;
  if (fs.existsSync(uploads)) {
    fs.cpSync(uploads, path.join(dest, 'uploads'), { recursive: true, filter: (src) => path.basename(src) !== '.gitkeep' });
    files = fs.readdirSync(path.join(dest, 'uploads')).length;
  }
  const size = fs.statSync(databaseBackup).size;
  console.log(`Backup created: ${dest}`);
  console.log(`  ${path.basename(databaseBackup)}  ${(size / 1024).toFixed(0)} KB`);
  console.log(`  uploads       ${files} files`);
  console.log('Copy this folder to another drive or cloud storage. A backup on the same computer does not survive a disk failure.');
})()
  .catch((err) => { console.error(`Backup failed: ${err.message}`); process.exitCode = 1; })
  .finally(async () => {
    if (dbDriver === 'sqlite') pool.database.close();
    else await pool.end();
  });
