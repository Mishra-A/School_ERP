const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_SQLITE_PATH = path.join(__dirname, '..', 'data', 'school-erp.sqlite');
const SQLITE_MIGRATIONS = [
  {
    name: '001_marks_absent.sql',
    sql: 'ALTER TABLE marks ADD COLUMN is_absent INTEGER NOT NULL DEFAULT 0',
  },
  {
    name: '002_fee_payment_void.sql',
    sql: [
      'ALTER TABLE fee_payments ADD COLUMN voided_at TEXT NULL',
      'ALTER TABLE fee_payments ADD COLUMN voided_by INTEGER NULL',
      'ALTER TABLE fee_payments ADD COLUMN void_reason TEXT NULL',
    ],
  },
  {
    name: '003_phase6.sql',
    sql: [
      'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE notices ADD COLUMN notified_at TEXT NULL',
      'UPDATE notices SET notified_at = CURRENT_TIMESTAMP',
    ],
  },
  {
    name: '004_teacher_attendance.sql',
    sql: `CREATE TABLE IF NOT EXISTS teacher_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL,
      marked_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (teacher_id, attendance_date),
      FOREIGN KEY (teacher_id) REFERENCES teachers(id),
      FOREIGN KEY (marked_by) REFERENCES users(id)
    )`,
  },
];

function splitTopLevel(value) {
  const items = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') quote = null;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(value.slice(start).trim());
  return items.filter(Boolean);
}

function mysqlColumnToSqlite(column) {
  let result = column
    .replace(/\bUNSIGNED\b/gi, '')
    .replace(/\bAUTO_INCREMENT\b/gi, '')
    .replace(/\bTINYINT\s*\(\s*1\s*\)/gi, 'INTEGER')
    .replace(/\b(?:SMALLINT|MEDIUMINT|TINYINT|BIGINT|INTEGER|INT)(?:\s*\(\s*\d+\s*\))?/gi, 'INTEGER')
    .replace(/\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT')
    .replace(/\bCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT')
    .replace(/\bENUM\s*\([^)]*\)/gi, 'TEXT')
    .replace(/\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'NUMERIC')
    .replace(/\b(?:DATETIME|TIMESTAMP|DATE|TIME)\b/gi, 'TEXT')
    .replace(/\bTEXT\b/gi, 'TEXT COLLATE NOCASE')
    .replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '')
    .replace(/\s+COMMENT\s+'[^']*'/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}

function mysqlCreateTableToSqlite(statement) {
  const match = statement.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([\s\S]*)\)\s*ENGINE\s*=\s*InnoDB\s*;?/i);
  if (!match) return null;
  const [, tableName, body] = match;
  const definitions = [];
  const indexes = [];
  let autoId = null;

  for (const rawDefinition of splitTopLevel(body)) {
    const definition = rawDefinition.trim();
    const autoMatch = definition.match(/^`?(\w+)`?\s+[^,]*\bAUTO_INCREMENT\b/i);
    if (autoMatch) {
      autoId = autoMatch[1];
      definitions.push(`\`${autoId}\` INTEGER PRIMARY KEY AUTOINCREMENT`);
      continue;
    }
    const keyMatch = definition.match(/^(UNIQUE\s+)?KEY\s+`?(\w+)`?\s*\(([^)]+)\)$/i);
    if (keyMatch) {
      const columns = keyMatch[3].replace(/`/g, '');
      if (keyMatch[1]) definitions.push(`UNIQUE (${columns})`);
      else indexes.push(`CREATE INDEX IF NOT EXISTS \`${keyMatch[2]}\` ON \`${tableName}\` (${columns})`);
      continue;
    }
    const primaryMatch = definition.match(/^PRIMARY KEY\s*\(([^)]+)\)$/i);
    if (primaryMatch && autoId && primaryMatch[1].replace(/[`\s]/g, '') === autoId) continue;
    definitions.push(mysqlColumnToSqlite(definition));
  }

  const createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${definitions.join(', ')})`;
  return [createSql, ...indexes];
}

function translateMysqlSql(sql) {
  let translated = sql
    .replace(/\s+FOR UPDATE\b/gi, '')
    .replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, 'INSERT OR IGNORE INTO')
    .replace(/"([^"\n]*)"/g, "'$1'")
    .replace(/DATE_SUB\s*\(\s*CURDATE\(\)\s*,\s*INTERVAL\s+(\d+)\s+MONTH\s*\)\s*-\s*INTERVAL\s*\(\s*DAY\(\s*CURDATE\(\)\s*\)\s*-\s*1\s*\)\s*DAY/gi, "DATE('now', 'localtime', 'start of month', '-$1 months')")
    .replace(/\bGREATEST\s*\(/gi, 'MAX(')
    .replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bCURDATE\s*\(\s*\)/gi, "DATE('now', 'localtime')")
    .replace(/\bWEEKDAY\s*\(\s*DATE\('now', 'localtime'\)\s*\)\s*\+\s*1/gi, 'APP_WEEKDAY_TODAY()')
    .replace(/\bTIME_FORMAT\s*\(\s*([^,()]+?)\s*,\s*'%H:%i'\s*\)/gi, "strftime('%H:%M', $1)")
    .replace(/\bDATE_FORMAT\s*\(\s*([^,]+),\s*'(%Y-%m|%Y-%m-%d)'\s*\)/gi, "strftime('$2', $1)")
    .replace(/\bDATE_SUB\s*\(\s*DATE_SUB\s*\(\s*DATE\('now', 'localtime'\)\s*,\s*INTERVAL\s+(\d+)\s+MONTH\s*\)\s*,\s*INTERVAL\s+DAY\s*\(\s*DATE\('now', 'localtime'\)\s*\)\s*-\s*1\s+DAY\s*\)/gi, "DATE(DATE('now', 'localtime'), 'start of month', '-$1 months')")
    .replace(/\bDATE_SUB\s*\(\s*DATE\('now', 'localtime'\)\s*,\s*INTERVAL\s+DAY\s*\(\s*DATE\('now', 'localtime'\)\s*\)\s*-\s*1\s+DAY\s*\)/gi, "DATE(DATE('now', 'localtime'), 'start of month')")
    .replace(/\bDATE_SUB\s*\(\s*DATE\('now', 'localtime'\)\s*,\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR)\s*\)/gi, "DATE(DATE('now', 'localtime'), '-$1 $2s')")
    .replace(/\bDATE_SUB\s*\(\s*CURRENT_TIMESTAMP\s*,\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR)\s*\)/gi, "DATETIME(CURRENT_TIMESTAMP, '-$1 $2s')")
    .replace(/\bINTERVAL\s*\(\s*DAY\s*\(\s*DATE\('now', 'localtime'\)\s*\)\s*-\s*1\s*\)\s+DAY/gi, "'-' || (CAST(strftime('%d', DATE('now', 'localtime')) AS INTEGER) - 1) || ' days'")
    .replace(/GROUP_CONCAT\(([^()]+?)\s+ORDER BY\s+([^,)]+?)\s+SEPARATOR\s+'([^']*)'\)/gi, (_, value, order, separator) => `GROUP_CONCAT(${value}, '${separator}' ORDER BY ${order})`)
    .replace(/\bVALUES\s*\(\s*([a-zA-Z_][\w]*)\s*\)/gi, 'excluded.$1');

  const duplicateMatch = translated.match(/INSERT\s+INTO\s+`?(attendance|marks|student_enrollments|parent_students)`?[\s\S]*?ON DUPLICATE KEY UPDATE\s+([\s\S]*)$/i);
  if (duplicateMatch) {
    const conflictKeys = {
      attendance: 'student_id, subject_id, attendance_date',
      marks: 'exam_schedule_id, student_id',
      student_enrollments: 'student_id, academic_year_id',
      parent_students: 'parent_id, student_id',
    };
    translated = translated.replace(/ON DUPLICATE KEY UPDATE/i, `ON CONFLICT (${conflictKeys[duplicateMatch[1].toLowerCase()]}) DO UPDATE SET`);
  }
  return translated;
}

function expandParameters(sql, params) {
  const values = Array.isArray(params) ? [...params] : params === undefined ? [] : [params];
  const bulkIndex = sql.search(/\bVALUES\s+\?/i);
  if (bulkIndex >= 0) {
    const paramIndex = (sql.slice(0, bulkIndex).match(/\?/g) || []).length;
    const rows = values[paramIndex];
    if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
      const width = rows[0].length;
      if (rows.some((row) => row.length !== width)) throw new Error('Bulk insert rows must have the same number of values.');
      const placeholders = rows.map(() => `(${Array(width).fill('?').join(', ')})`).join(', ');
      sql = sql.replace(/\bVALUES\s+\?/i, `VALUES ${placeholders}`);
      values.splice(paramIndex, 1, ...rows.flat());
    }
  }

  let expandedSql = '';
  const expandedValues = [];
  let valueIndex = 0;
  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] !== '?') {
      expandedSql += sql[index];
      continue;
    }
    const value = values[valueIndex++];
    if (Array.isArray(value)) {
      if (!value.length) {
        expandedSql += 'NULL';
      } else {
        expandedSql += value.map(() => '?').join(', ');
        expandedValues.push(...value);
      }
    } else {
      expandedSql += '?';
      expandedValues.push(value);
    }
  }
  return { sql: expandedSql, params: expandedValues };
}

function createSqliteDatabase(databasePath = process.env.SQLITE_PATH || DEFAULT_SQLITE_PATH) {
  fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.function('CONCAT', { varargs: true }, (...values) => values.map((value) => value ?? '').join(''));
  database.function('IF', (condition, yes, no) => condition ? yes : no);
  database.function('DATEDIFF', (left, right) => Math.floor((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86400000));
  database.function('WEEKDAY', (value) => (new Date(`${value}T00:00:00`).getDay() + 6) % 7);
  database.function('APP_WEEKDAY_TODAY', () => ((new Date().getDay() + 6) % 7) + 1);

  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
  const tablePattern = /CREATE TABLE IF NOT EXISTS[\s\S]*?\)\s*ENGINE\s*=\s*InnoDB\s*;/gi;
  for (const match of schema.matchAll(tablePattern)) {
    const statements = mysqlCreateTableToSqlite(match[0]);
    if (statements) for (const statement of statements) database.exec(statement);
  }

  database.exec('CREATE TABLE IF NOT EXISTS app_schema_migrations (name TEXT PRIMARY KEY)');
  const hasMigration = database.prepare('SELECT 1 FROM app_schema_migrations WHERE name = ?');
  const recordMigration = database.prepare('INSERT INTO app_schema_migrations (name) VALUES (?)');
  for (const migration of SQLITE_MIGRATIONS) {
    if (hasMigration.get(migration.name)) continue;
    const statements = Array.isArray(migration.sql) ? migration.sql : [migration.sql];
    database.transaction(() => {
      for (const statement of statements) database.exec(statement);
      recordMigration.run(migration.name);
    })();
  }

  const query = async (sourceSql, sourceParams = []) => {
    try {
      let sql = translateMysqlSql(sourceSql);
      const expanded = expandParameters(sql, sourceParams);
      sql = expanded.sql;
      const statement = database.prepare(sql);
      if (statement.reader) return [statement.all(...expanded.params), []];
      const result = statement.run(...expanded.params);
      return [{ insertId: Number(result.lastInsertRowid) || 0, affectedRows: result.changes }, []];
    } catch (error) {
      error.sqlOperation = sourceSql.trim().match(/^[A-Z]+/i)?.[0]?.toUpperCase();
      error.sqlMessage = error.message;
      throw error;
    }
  };

  const connection = {
    query,
    beginTransaction: async () => database.exec('BEGIN IMMEDIATE'),
    commit: async () => database.exec('COMMIT'),
    rollback: async () => database.exec('ROLLBACK'),
    release: () => {},
  };

  return {
    database,
    query,
    getConnection: async () => connection,
    end: async () => database.close(),
  };
}

module.exports = { createSqliteDatabase, translateMysqlSql, expandParameters, mysqlCreateTableToSqlite };