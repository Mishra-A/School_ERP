const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { likeTerm } = require('../utils/validate');
const people = require('./people.service');
const { canViewStudent, viewerStudentIds } = require('./access.service');
const { logActivity } = require('../utils/activityLog');

const CURRENT_YEAR_SQL = '(SELECT id FROM academic_years WHERE is_current = 1 ORDER BY start_date DESC LIMIT 1)';

// Lists students with their current-year placement. Teachers only ever get their own students.
async function list(user, { search, sectionId, status, page, limit, offset }) {
  const where = [];
  const params = [];

  if (user.role === 'teacher') {
    where.push(`(se.section_id IN (SELECT section_id FROM class_subjects WHERE teacher_id = ?)
              OR se.section_id IN (SELECT id FROM sections WHERE class_teacher_id = ?))`);
    params.push(user.profileId || 0, user.profileId || 0);
  }
  if (search) {
    where.push('(u.name LIKE ? OR st.admission_no LIKE ? OR u.email LIKE ?)');
    const term = likeTerm(search);
    params.push(term, term, term);
  }
  if (sectionId) { where.push('se.section_id = ?'); params.push(sectionId); }
  if (user.role === 'admin') {
    if (status === 'active') where.push('u.is_active = 1');
    if (status === 'inactive') where.push('u.is_active = 0');
  } else {
    where.push('u.is_active = 1');
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN student_enrollments se ON se.student_id = st.id AND se.academic_year_id = ${CURRENT_YEAR_SQL}
      LEFT JOIN sections s ON s.id = se.section_id
      LEFT JOIN classes c ON c.id = s.class_id`;

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT st.id, u.name, u.email, u.is_active AS isActive, st.admission_no AS admissionNo, st.gender,
            se.roll_no AS rollNo, se.section_id AS sectionId, c.name AS className, s.name AS sectionName
       ${from} ${clause} ORDER BY c.name, s.name, se.roll_no, u.name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { rows: rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) })), total, page, limit };
}

async function getProfile(user, id) {
  if (!(await canViewStudent(user, id))) {
    // Same answer whether the student exists or not, so ids can't be probed.
    throw new AppError("You don't have access to this student.", user.role === 'admin' ? 404 : 403);
  }
  const [rows] = await pool.query(
    `SELECT st.id, u.name, u.email, u.is_active AS isActive, st.admission_no AS admissionNo, st.dob, st.gender, st.phone, st.address
       FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?`,
    [id]
  );
  if (!rows[0]) throw new AppError('Student not found.', 404);
  const student = { ...rows[0], isActive: Boolean(rows[0].isActive) };

  const [history] = await pool.query(
    `SELECT se.id, ay.name AS yearName, ay.is_current AS isCurrent, c.name AS className, s.name AS sectionName,
            se.section_id AS sectionId, se.roll_no AS rollNo
       FROM student_enrollments se
       JOIN academic_years ay ON ay.id = se.academic_year_id
       JOIN sections s ON s.id = se.section_id
       JOIN classes c ON c.id = s.class_id
      WHERE se.student_id = ? ORDER BY ay.start_date DESC`,
    [id]
  );
  const enrollments = history.map((h) => ({ ...h, isCurrent: Boolean(h.isCurrent) }));

  // Contact details of guardians are for staff only; students and parents see names and relations.
  const staff = user.role === 'admin' || user.role === 'teacher';
  const [parents] = await pool.query(
    `SELECT p.id, u.name, ps.relation ${staff ? ', p.phone, u.email' : ''}
       FROM parent_students ps JOIN parents p ON p.id = ps.parent_id JOIN users u ON u.id = p.user_id
      WHERE ps.student_id = ? ORDER BY u.name`,
    [id]
  );

  return { student, current: enrollments.find((e) => e.isCurrent) || null, enrollments, parents };
}

async function resolveSection(conn, sectionId) {
  const [[year]] = await conn.query(`SELECT id FROM academic_years WHERE id = ${CURRENT_YEAR_SQL}`);
  if (!year) throw new AppError('Set a current academic year before enrolling students.', 409);
  const [[sec]] = await conn.query(
    'SELECT s.id FROM sections s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.academic_year_id = ?',
    [sectionId, year.id]
  );
  if (!sec) throw new AppError('Choose a section from the current academic year.', 422);
  return year.id;
}

async function create(actorId, d) {
  const result = await withTransaction(async (conn) => {
    const yearId = d.sectionId ? await resolveSection(conn, d.sectionId) : null;
    const { userId, temporaryPassword } = await people.createUserRow(conn, 'student', d.name, d.email);
    const [r] = await conn.query(
      'INSERT INTO students (user_id, admission_no, dob, gender, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, d.admissionNo, d.dob, d.gender, d.phone, d.address]
    );
    if (d.sectionId) {
      await conn.query('INSERT INTO student_enrollments (student_id, section_id, academic_year_id, roll_no) VALUES (?, ?, ?, ?)',
        [r.insertId, d.sectionId, yearId, d.rollNo]);
    }
    return { id: r.insertId, name: d.name, email: d.email, temporaryPassword };
  });
  await logActivity(actorId, 'student_created', 'student', result.id);
  return result;
}

async function update(actorId, id, d) {
  await withTransaction(async (conn) => {
    await people.updateUserRow(conn, 'student', id, d.name, d.email);
    await conn.query('UPDATE students SET admission_no = ?, dob = ?, gender = ?, phone = ?, address = ? WHERE id = ?',
      [d.admissionNo, d.dob, d.gender, d.phone, d.address, id]);
    if (d.sectionId) {
      const yearId = await resolveSection(conn, d.sectionId);
      await conn.query(
        `INSERT INTO student_enrollments (student_id, section_id, academic_year_id, roll_no) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE section_id = VALUES(section_id), roll_no = VALUES(roll_no)`,
        [id, d.sectionId, yearId, d.rollNo]
      );
    }
  });
  await logActivity(actorId, 'student_updated', 'student', id);
}

async function linkParent(actorId, studentId, { parentId, relation }) {
  const [[st]] = await pool.query('SELECT id FROM students WHERE id = ?', [studentId]);
  if (!st) throw new AppError('Student not found.', 404);
  const [[pa]] = await pool.query('SELECT id FROM parents WHERE id = ?', [parentId]);
  if (!pa) throw new AppError('Parent not found.', 404);
  await pool.query(
    'INSERT INTO parent_students (parent_id, student_id, relation) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE relation = VALUES(relation)',
    [parentId, studentId, relation]
  );
  await logActivity(actorId, 'parent_linked', 'student', studentId);
}

async function unlinkParent(actorId, studentId, parentId) {
  const [r] = await pool.query('DELETE FROM parent_students WHERE student_id = ? AND parent_id = ?', [studentId, parentId]);
  if (!r.affectedRows) throw new AppError('That parent is not linked to this student.', 404);
  await logActivity(actorId, 'parent_unlinked', 'student', studentId);
}

// For selectors: the student themself, or a parent's linked children, with current placement.
async function myStudents(user) {
  const ids = await viewerStudentIds(user);
  if (!ids.length) return [];
  const [rows] = await pool.query(
    `SELECT st.id, u.name, c.name AS className, s.name AS sectionName, se.section_id AS sectionId
       FROM students st JOIN users u ON u.id = st.user_id
       LEFT JOIN student_enrollments se ON se.student_id = st.id AND se.academic_year_id = ${CURRENT_YEAR_SQL}
       LEFT JOIN sections s ON s.id = se.section_id LEFT JOIN classes c ON c.id = s.class_id
      WHERE st.id IN (?) ORDER BY u.name`, [ids]);
  return rows;
}

module.exports = { myStudents, list, getProfile, create, update, linkParent, unlinkParent };
