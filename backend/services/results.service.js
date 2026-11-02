const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { canViewStudent, canViewSection } = require('./access.service');
const { getScale, gradeFor } = require('./grades.service');

const round2 = (n) => Number(n.toFixed(2));

// rows: one per exam subject, with markId null when nothing has been entered yet.
//  - absent counts as 0 marks and a fail in that subject (the maximum still counts towards the total)
//  - while any subject has no marks the result is "pending" and no overall grade is given
//  - overall result is "pass" only if every subject is passed
function computeResult(rows, scale) {
  let obtained = 0;
  let max = 0;
  let allPass = true;
  const pendingSubjects = [];
  const subjects = rows.map((r) => {
    const base = { subjectId: r.subjectId, subjectName: r.subjectName, examDate: r.examDate, maxMarks: Number(r.maxMarks), passMarks: Number(r.passMarks) };
    if (r.markId === null || r.markId === undefined) {
      pendingSubjects.push(r.subjectName);
      return { ...base, marks: null, absent: false, percentage: null, grade: null, status: 'pending' };
    }
    const absent = Boolean(r.absent);
    const marks = absent ? 0 : Number(r.marks);
    const pass = !absent && marks >= base.passMarks;
    obtained += marks;
    max += base.maxMarks;
    if (!pass) allPass = false;
    const percentage = round2((marks / base.maxMarks) * 100);
    return { ...base, marks, absent, percentage, grade: absent ? 'AB' : gradeFor(percentage, scale), status: absent ? 'absent' : pass ? 'pass' : 'fail' };
  });
  const percentage = max > 0 ? round2((obtained / max) * 100) : null;
  const complete = rows.length > 0 && pendingSubjects.length === 0;
  return {
    subjects, totalObtained: obtained, totalMax: max, percentage, pendingSubjects,
    grade: complete ? gradeFor(percentage, scale) : null,
    result: !complete ? 'pending' : allPass ? 'pass' : 'fail',
  };
}

const SUBJECT_ROWS = `SELECT es.id AS scheduleId, es.exam_id AS examId, es.subject_id AS subjectId, sub.name AS subjectName, es.exam_date AS examDate,
                             es.max_marks AS maxMarks, es.pass_marks AS passMarks, m.id AS markId, m.marks_obtained AS marks, m.is_absent AS absent
                        FROM exam_schedules es JOIN subjects sub ON sub.id = es.subject_id
                        LEFT JOIN marks m ON m.exam_schedule_id = es.id AND m.student_id = ?`;

// Shared by the results API and the PDF: null if the student isn't (or wasn't) in this exam's class that year.
async function loadStudentExam(studentId, examId) {
  const [rows] = await pool.query(
    `SELECT e.id AS examId, e.name AS examName, e.start_date AS startDate, e.end_date AS endDate, ay.name AS yearName,
            c.name AS className, s.name AS sectionName, se.roll_no AS rollNo, s.class_teacher_id AS classTeacherId,
            st.id AS studentId, u.name AS studentName, st.admission_no AS admissionNo
       FROM exams e
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN student_enrollments se ON se.student_id = ? AND se.academic_year_id = e.academic_year_id
       JOIN sections s ON s.id = se.section_id AND s.class_id = e.class_id
       JOIN classes c ON c.id = s.class_id
       JOIN students st ON st.id = se.student_id JOIN users u ON u.id = st.user_id
      WHERE e.id = ?`, [studentId, examId]);
  if (!rows[0]) return null;
  const [subjectRows] = await pool.query(`${SUBJECT_ROWS} WHERE es.exam_id = ? ORDER BY es.exam_date, sub.name`, [studentId, examId]);
  return { info: rows[0], result: computeResult(subjectRows, await getScale()) };
}

async function history(user, studentId) {
  if (!(await canViewStudent(user, studentId))) throw new AppError("You don't have access to this student.", 403);
  const [exams] = await pool.query(
    `SELECT e.id AS examId, e.name AS examName, e.start_date AS startDate, ay.name AS yearName, ay.start_date AS yearStart,
            c.name AS className, s.name AS sectionName
       FROM student_enrollments se
       JOIN sections s ON s.id = se.section_id JOIN classes c ON c.id = s.class_id
       JOIN academic_years ay ON ay.id = se.academic_year_id
       JOIN exams e ON e.class_id = s.class_id AND e.academic_year_id = se.academic_year_id
      WHERE se.student_id = ? ORDER BY ay.start_date DESC, e.start_date DESC, e.id DESC`, [studentId]);
  if (!exams.length) return [];
  const [subjectRows] = await pool.query(`${SUBJECT_ROWS} WHERE es.exam_id IN (?) ORDER BY es.exam_date`, [studentId, exams.map((e) => e.examId)]);
  const scale = await getScale();
  const out = [];
  for (const e of exams) {
    const rows = subjectRows.filter((r) => r.examId === e.examId);
    if (!rows.some((r) => r.markId !== null)) continue; // nothing entered yet: not a result
    const { subjects, ...summary } = computeResult(rows, scale);
    out.push({ ...e, ...summary });
  }
  return out;
}

async function detail(user, studentId, examId) {
  if (!(await canViewStudent(user, studentId))) throw new AppError("You don't have access to this student.", 403);
  const data = await loadStudentExam(studentId, examId);
  if (!data) throw new AppError('This student has no such exam.', 404);
  return data;
}

async function classSheet(user, examId, sectionId) {
  const [[exam]] = await pool.query(
    `SELECT e.id, e.name, e.class_id AS classId, e.academic_year_id AS yearId, c.name AS className
       FROM exams e JOIN classes c ON c.id = e.class_id WHERE e.id = ?`, [examId]);
  if (!exam) throw new AppError('Exam not found.', 404);
  const [[sec]] = await pool.query('SELECT id, name FROM sections WHERE id = ? AND class_id = ?', [sectionId, exam.classId]);
  if (!sec) throw new AppError("That section isn't in this exam's class.", 422);
  if (!(await canViewSection(user, sectionId))) throw new AppError("You don't have access to this section.", 403);

  const [schedule] = await pool.query(
    `SELECT es.id AS scheduleId, es.subject_id AS subjectId, sub.name AS subjectName, es.exam_date AS examDate, es.max_marks AS maxMarks, es.pass_marks AS passMarks
       FROM exam_schedules es JOIN subjects sub ON sub.id = es.subject_id WHERE es.exam_id = ? ORDER BY es.exam_date, sub.name`, [examId]);
  const [students] = await pool.query(
    `SELECT st.id AS studentId, u.name, st.admission_no AS admissionNo, se.roll_no AS rollNo
       FROM student_enrollments se JOIN students st ON st.id = se.student_id JOIN users u ON u.id = st.user_id AND u.is_active = 1
      WHERE se.section_id = ? AND se.academic_year_id = ? ORDER BY se.roll_no IS NULL, se.roll_no, u.name`, [sectionId, exam.yearId]);
  const [marks] = students.length
    ? await pool.query(
      `SELECT m.id AS markId, m.student_id AS studentId, m.exam_schedule_id AS scheduleId, m.marks_obtained AS marks, m.is_absent AS absent
         FROM marks m JOIN exam_schedules es ON es.id = m.exam_schedule_id WHERE es.exam_id = ? AND m.student_id IN (?)`,
      [examId, students.map((s) => s.studentId)])
    : [[]];
  const scale = await getScale();
  const rows = students.map((s) => {
    const rowsForStudent = schedule.map((sc) => {
      const m = marks.find((x) => x.studentId === s.studentId && x.scheduleId === sc.scheduleId);
      return { ...sc, markId: m ? m.markId : null, marks: m ? m.marks : null, absent: m ? m.absent : 0 };
    });
    return { ...s, ...computeResult(rowsForStudent, scale) };
  });
  return { exam, section: sec, schedule, rows };
}

module.exports = { computeResult, loadStudentExam, history, detail, classSheet };
