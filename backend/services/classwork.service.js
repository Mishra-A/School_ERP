const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const files = require('./files.service');
const { logActivity } = require('../utils/activityLog');
const notifications = require('./notifications.service');
const { canViewSection, canViewStudent, viewerStudentIds, today, CURRENT_YEAR_SQL } = require('./access.service');

const forbidden = () => new AppError("You don't have access to this.", 403);

// ---------------------------------------------------------------- helpers
async function getClassSubject(conn, id) {
  const [rows] = await conn.query(
    `SELECT cs.id, cs.section_id AS sectionId, cs.subject_id AS subjectId, cs.teacher_id AS teacherId,
            CONCAT(c.name, ' - ', s.name) AS sectionLabel, c.academic_year_id AS yearId, sub.name AS subjectName
       FROM class_subjects cs JOIN sections s ON s.id = cs.section_id JOIN classes c ON c.id = s.class_id JOIN subjects sub ON sub.id = cs.subject_id
      WHERE cs.id = ?`, [id]);
  if (!rows[0]) throw new AppError('That subject assignment does not exist.', 422);
  return rows[0];
}

// Teachers manage only their own subject/section; admins manage everything.
function assertManages(user, cs) {
  if (user.role === 'admin') return;
  if (user.role === 'teacher' && cs.teacherId === user.profileId) return;
  throw forbidden();
}

async function loadAssignment(id) {
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.description, a.due_date AS dueDate, a.file_path AS filePath, a.created_at AS createdAt, a.class_subject_id AS classSubjectId,
            cs.section_id AS sectionId, cs.teacher_id AS teacherId, cs.subject_id AS subjectId, sub.name AS subjectName,
            CONCAT(c.name, ' - ', s.name) AS sectionLabel, c.academic_year_id AS yearId
       FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
       JOIN sections s ON s.id = cs.section_id JOIN classes c ON c.id = s.class_id JOIN subjects sub ON sub.id = cs.subject_id
      WHERE a.id = ?`, [id]);
  if (!rows[0]) throw new AppError('Assignment not found.', 404);
  return rows[0];
}

const publicAssignment = (a) => ({ id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, hasFile: Boolean(a.filePath),
  classSubjectId: a.classSubjectId, subjectName: a.subjectName, sectionLabel: a.sectionLabel, createdAt: a.createdAt });

const isLate = (submittedAt, dueDate) => String(submittedAt).slice(0, 10) > dueDate;

// ---------------------------------------------------------------- assignments
async function listForStaff(user, { classSubjectId }) {
  const params = [];
  let filter = '';
  if (user.role === 'teacher') { filter += ' AND cs.teacher_id = ?'; params.push(user.profileId || 0); }
  if (classSubjectId) { filter += ' AND cs.id = ?'; params.push(classSubjectId); }
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.due_date AS dueDate, (a.file_path IS NOT NULL) AS hasFile, cs.id AS classSubjectId,
            sub.name AS subjectName, CONCAT(c.name, ' - ', s.name) AS sectionLabel,
            (SELECT COUNT(*) FROM assignment_submissions x WHERE x.assignment_id = a.id) AS submitted,
            (SELECT COUNT(*) FROM student_enrollments se JOIN students st ON st.id = se.student_id JOIN users u ON u.id = st.user_id AND u.is_active = 1
              WHERE se.section_id = cs.section_id AND se.academic_year_id = c.academic_year_id) AS totalStudents
       FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
       JOIN sections s ON s.id = cs.section_id JOIN classes c ON c.id = s.class_id AND c.academic_year_id = ${CURRENT_YEAR_SQL}
       JOIN subjects sub ON sub.id = cs.subject_id
      WHERE 1 = 1 ${filter} ORDER BY a.due_date DESC, a.id DESC LIMIT 200`, params);
  return rows.map((r) => ({ ...r, hasFile: Boolean(r.hasFile) }));
}

async function listForStudent(user, studentId) {
  if (!(await canViewStudent(user, studentId))) throw forbidden();
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.description, a.due_date AS dueDate, (a.file_path IS NOT NULL) AS hasFile, sub.name AS subjectName,
            sb.id AS submissionId, sb.submitted_at AS submittedAt, sb.status, sb.feedback
       FROM student_enrollments se
       JOIN class_subjects cs ON cs.section_id = se.section_id
       JOIN assignments a ON a.class_subject_id = cs.id
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN assignment_submissions sb ON sb.assignment_id = a.id AND sb.student_id = se.student_id
      WHERE se.student_id = ? AND se.academic_year_id = ${CURRENT_YEAR_SQL}
      ORDER BY a.due_date DESC, a.id DESC LIMIT 200`, [studentId]);
  const now = await today();
  return rows.map((r) => ({
    ...r, hasFile: Boolean(r.hasFile),
    state: r.status === 'reviewed' ? 'reviewed' : r.submissionId ? 'submitted' : r.dueDate < now ? 'missing' : 'pending',
    isLate: r.submissionId ? isLate(r.submittedAt, r.dueDate) : false,
  }));
}

async function createAssignment(user, d, file) {
  const cs = await getClassSubject(pool, d.classSubjectId);
  assertManages(user, cs);
  if (d.dueDate < (await today())) throw new AppError('The due date cannot be in the past.', 422);
  const [r] = await pool.query(
    'INSERT INTO assignments (class_subject_id, title, description, due_date, file_path, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [d.classSubjectId, d.title, d.description, d.dueDate, file ? file.filename : null, user.id]
  );
  await logActivity(user.id, 'assignment_created', 'assignment', r.insertId);
  await notifications.safely(() => notifications.notifySection(cs.sectionId,
    { title: `New assignment: ${d.title}`, message: `${cs.subjectName} - due ${d.dueDate}`, link: '/pages/assignments.html' }, { excludeUserId: user.id }));
  return { id: r.insertId };
}

async function updateAssignment(user, id, d, file) {
  const a = await loadAssignment(id);
  assertManages(user, a);
  const newFile = file ? file.filename : a.filePath;
  await pool.query('UPDATE assignments SET title = ?, description = ?, due_date = ?, file_path = ? WHERE id = ?', [d.title, d.description, d.dueDate, newFile, id]);
  if (file && a.filePath) files.remove(a.filePath);
  await logActivity(user.id, 'assignment_updated', 'assignment', id);
}

async function deleteAssignment(user, id) {
  const a = await loadAssignment(id);
  assertManages(user, a);
  const [[n]] = await pool.query('SELECT COUNT(*) AS n FROM assignment_submissions WHERE assignment_id = ?', [id]);
  if (n.n) throw new AppError('Students have already submitted work for this assignment, so it can\'t be deleted.', 409);
  await pool.query('DELETE FROM assignments WHERE id = ?', [id]);
  files.remove(a.filePath);
  await logActivity(user.id, 'assignment_deleted', 'assignment', id);
}

async function assignmentFile(user, id) {
  const a = await loadAssignment(id);
  if (!(await canViewSection(user, a.sectionId))) throw forbidden();
  if (!a.filePath) throw new AppError('This assignment has no attachment.', 404);
  return { stored: a.filePath, title: a.title };
}

async function assignmentDetail(user, id) {
  const a = await loadAssignment(id);
  if (!(await canViewSection(user, a.sectionId))) throw forbidden();
  return publicAssignment(a);
}

// ---------------------------------------------------------------- submissions
async function listSubmissions(user, assignmentId) {
  const a = await loadAssignment(assignmentId);
  assertManages(user, a);
  const [rows] = await pool.query(
    `SELECT st.id AS studentId, u.name, se.roll_no AS rollNo, sb.id AS submissionId, sb.submitted_at AS submittedAt, sb.status, sb.feedback
       FROM student_enrollments se JOIN students st ON st.id = se.student_id JOIN users u ON u.id = st.user_id AND u.is_active = 1
       LEFT JOIN assignment_submissions sb ON sb.assignment_id = ? AND sb.student_id = st.id
      WHERE se.section_id = ? AND se.academic_year_id = ?
      ORDER BY se.roll_no IS NULL, se.roll_no, u.name`, [assignmentId, a.sectionId, a.yearId]);
  return {
    assignment: publicAssignment(a),
    rows: rows.map((r) => ({ ...r, isLate: r.submissionId ? isLate(r.submittedAt, a.dueDate) : false })),
  };
}

async function submit(user, assignmentId, file) {
  if (user.role !== 'student') throw new AppError('Only students can submit work.', 403);
  const a = await loadAssignment(assignmentId);
  const [[enrolled]] = await pool.query(
    `SELECT COUNT(*) AS n FROM student_enrollments WHERE student_id = ? AND section_id = ? AND academic_year_id = ${CURRENT_YEAR_SQL}`, [user.profileId, a.sectionId]);
  if (!enrolled.n) throw forbidden();

  const oldFile = await withTransaction(async (conn) => {
    const [[existing]] = await conn.query('SELECT id, status, file_path FROM assignment_submissions WHERE assignment_id = ? AND student_id = ? FOR UPDATE', [assignmentId, user.profileId]);
    if (existing && existing.status === 'reviewed') throw new AppError('Your teacher has already reviewed this submission, so it can\'t be replaced.', 409);
    if (existing) {
      await conn.query('UPDATE assignment_submissions SET file_path = ?, submitted_at = NOW() WHERE id = ?', [file.filename, existing.id]);
      return existing.file_path;
    }
    await conn.query('INSERT INTO assignment_submissions (assignment_id, student_id, file_path) VALUES (?, ?, ?)', [assignmentId, user.profileId, file.filename]);
    return null;
  });
  if (oldFile) files.remove(oldFile);
  await logActivity(user.id, 'assignment_submitted', 'assignment', assignmentId);
}

async function loadSubmission(id) {
  const [rows] = await pool.query(
    `SELECT sb.id, sb.student_id AS studentId, sb.file_path AS filePath, a.id AS assignmentId, a.title, cs.teacher_id AS teacherId, cs.section_id AS sectionId, u.name AS studentName
       FROM assignment_submissions sb JOIN assignments a ON a.id = sb.assignment_id JOIN class_subjects cs ON cs.id = a.class_subject_id
       JOIN students st ON st.id = sb.student_id JOIN users u ON u.id = st.user_id WHERE sb.id = ?`, [id]);
  if (!rows[0]) throw new AppError('Submission not found.', 404);
  return rows[0];
}

async function submissionFile(user, id) {
  const sb = await loadSubmission(id);
  // Only the assignment's own teacher (or admin), the student, and the student's parents. Other teachers of the
  // same class are deliberately excluded: they can see the student, but not every subject's homework.
  const allowed =
    user.role === 'admin' ||
    (user.role === 'teacher' && sb.teacherId === user.profileId) ||
    (user.role === 'student' && user.profileId === sb.studentId) ||
    (user.role === 'parent' && (await canViewStudent(user, sb.studentId)));
  if (!allowed) throw forbidden();
  return { stored: sb.filePath, title: `${sb.studentName} - ${sb.title}` };
}

async function review(user, id, { feedback }) {
  const sb = await loadSubmission(id);
  assertManages(user, sb);
  await pool.query("UPDATE assignment_submissions SET feedback = ?, status = 'reviewed' WHERE id = ?", [feedback, id]);
  await logActivity(user.id, 'submission_reviewed', 'assignment', sb.assignmentId);
  await notifications.safely(() => notifications.notifyStudents([sb.studentId],
    { title: 'Your work was reviewed', message: `${sb.title}: ${feedback.slice(0, 150)}`, link: '/pages/assignments.html', email: false }, { excludeUserId: user.id }));
}

// ---------------------------------------------------------------- study material
async function listMaterials(user, { classSubjectId, studentId }) {
  const params = [];
  let sql = `SELECT m.id, m.title, m.description, m.created_at AS createdAt, sub.name AS subjectName, CONCAT(c.name, ' - ', s.name) AS sectionLabel, cs.id AS classSubjectId, u.name AS uploadedBy
               FROM study_materials m JOIN class_subjects cs ON cs.id = m.class_subject_id
               JOIN sections s ON s.id = cs.section_id JOIN classes c ON c.id = s.class_id AND c.academic_year_id = ${CURRENT_YEAR_SQL}
               JOIN subjects sub ON sub.id = cs.subject_id JOIN users u ON u.id = m.uploaded_by WHERE 1 = 1`;
  if (user.role === 'student' || user.role === 'parent') {
    const sid = user.role === 'student' ? user.profileId : studentId;
    if (!sid || !(await canViewStudent(user, sid))) throw forbidden();
    sql += ' AND cs.section_id IN (SELECT section_id FROM student_enrollments WHERE student_id = ? AND academic_year_id = ' + CURRENT_YEAR_SQL + ')';
    params.push(sid);
  } else if (user.role === 'teacher') {
    sql += ' AND cs.teacher_id = ?'; params.push(user.profileId || 0);
  }
  if (classSubjectId) { sql += ' AND cs.id = ?'; params.push(classSubjectId); }
  const [rows] = await pool.query(`${sql} ORDER BY m.created_at DESC LIMIT 200`, params);
  return rows;
}

async function createMaterial(user, d, file) {
  const cs = await getClassSubject(pool, d.classSubjectId);
  assertManages(user, cs);
  const [r] = await pool.query('INSERT INTO study_materials (class_subject_id, title, description, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?)',
    [d.classSubjectId, d.title, d.description, file.filename, user.id]);
  await logActivity(user.id, 'material_uploaded', 'study_material', r.insertId);
  return { id: r.insertId };
}

async function loadMaterial(id) {
  const [rows] = await pool.query(
    `SELECT m.id, m.title, m.file_path AS filePath, cs.section_id AS sectionId, cs.teacher_id AS teacherId
       FROM study_materials m JOIN class_subjects cs ON cs.id = m.class_subject_id WHERE m.id = ?`, [id]);
  if (!rows[0]) throw new AppError('Study material not found.', 404);
  return rows[0];
}

async function materialFile(user, id) {
  const m = await loadMaterial(id);
  if (!(await canViewSection(user, m.sectionId))) throw forbidden();
  return { stored: m.filePath, title: m.title };
}

async function deleteMaterial(user, id) {
  const m = await loadMaterial(id);
  assertManages(user, m);
  await pool.query('DELETE FROM study_materials WHERE id = ?', [id]);
  files.remove(m.filePath);
  await logActivity(user.id, 'material_deleted', 'study_material', id);
}

module.exports = {
  listForStaff, listForStudent, createAssignment, updateAssignment, deleteAssignment, assignmentFile, assignmentDetail,
  listSubmissions, submit, submissionFile, review,
  listMaterials, createMaterial, materialFile, deleteMaterial,
};
