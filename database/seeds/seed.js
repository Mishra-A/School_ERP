// Seeds role defaults, grade scale, the first admin, and a compact demo dataset for dashboards.
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../../backend/config/db');
const { BCRYPT_ROUNDS } = require('../../backend/services/auth.service');

const ROLES = ['admin', 'teacher', 'student', 'parent'];
const GRADES = [
  ['A+', 90, 100], ['A', 80, 89.99], ['B+', 70, 79.99], ['B', 60, 69.99],
  ['C', 50, 59.99], ['D', 40, 49.99], ['F', 0, 39.99],
];

function pad(n) { return String(n).padStart(2, '0'); }

function isoDate(daysAgo) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function createIfMissing(table, whereSql, params, insertSql, insertParams) {
  const [existing] = await pool.query(whereSql, params);
  if (existing.length) return existing[0].id;
  const [result] = await pool.query(insertSql, insertParams);
  return result.insertId;
}

async function ensureDemoData() {
  if (process.env.TEST_RUN === '1') {
    console.log('Demo school data skipped for isolated test fixtures.');
    return;
  }

  const currentYear = new Date().getFullYear();
  const yearName = `${currentYear}-${currentYear + 1}`;
  const academicYearId = await createIfMissing(
    'academic_years',
    'SELECT id FROM academic_years WHERE name = ? LIMIT 1',
    [yearName],
    'INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES (?, ?, ?, 1)',
    [yearName, `${currentYear}-04-01`, `${currentYear + 1}-03-31`]
  );

  const classId = await createIfMissing(
    'classes',
    'SELECT id FROM classes WHERE academic_year_id = ? AND name = ? LIMIT 1',
    [academicYearId, 'Class 6'],
    'INSERT INTO classes (academic_year_id, name) VALUES (?, ?)',
    [academicYearId, 'Class 6']
  );

  const sectionId = await createIfMissing(
    'sections',
    'SELECT id FROM sections WHERE class_id = ? AND name = ? LIMIT 1',
    [classId, 'A'],
    'INSERT INTO sections (class_id, name) VALUES (?, ?)',
    [classId, 'A']
  );

  const mathId = await createIfMissing(
    'subjects',
    'SELECT id FROM subjects WHERE code = ? LIMIT 1',
    ['MATH'],
    'INSERT INTO subjects (name, code) VALUES (?, ?)',
    ['Mathematics', 'MATH']
  );

  const engId = await createIfMissing(
    'subjects',
    'SELECT id FROM subjects WHERE code = ? LIMIT 1',
    ['ENG'],
    'INSERT INTO subjects (name, code) VALUES (?, ?)',
    ['English', 'ENG']
  );

  const teacherRoleId = (await pool.query('SELECT id FROM roles WHERE name = "teacher"'))[0][0].id;
  const studentRoleId = (await pool.query('SELECT id FROM roles WHERE name = "student"'))[0][0].id;
  const adminUserId = (await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [(process.env.ADMIN_EMAIL || '').trim().toLowerCase()]))[0][0]?.id;

  const teacherOneUserId = await createIfMissing(
    'users',
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    ['teacher1@example.com'],
    'INSERT INTO users (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
    [teacherRoleId, 'Riya Sharma', 'teacher1@example.com', await bcrypt.hash('Teacher@123', BCRYPT_ROUNDS)]
  );

  const teacherTwoUserId = await createIfMissing(
    'users',
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    ['teacher2@example.com'],
    'INSERT INTO users (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
    [teacherRoleId, 'Amit Verma', 'teacher2@example.com', await bcrypt.hash('Teacher@123', BCRYPT_ROUNDS)]
  );

  const teacherOneId = await createIfMissing(
    'teachers',
    'SELECT id FROM teachers WHERE user_id = ? LIMIT 1',
    [teacherOneUserId],
    'INSERT INTO teachers (user_id, employee_code, phone, qualification, joined_on) VALUES (?, ?, ?, ?, ?)',
    [teacherOneUserId, 'TCH-101', '9876501010', 'M.Sc. Mathematics', `${currentYear - 3}-06-15`]
  );

  const teacherTwoId = await createIfMissing(
    'teachers',
    'SELECT id FROM teachers WHERE user_id = ? LIMIT 1',
    [teacherTwoUserId],
    'INSERT INTO teachers (user_id, employee_code, phone, qualification, joined_on) VALUES (?, ?, ?, ?, ?)',
    [teacherTwoUserId, 'TCH-102', '9876502020', 'M.A. English', `${currentYear - 2}-08-20`]
  );

  await createIfMissing(
    'class_subjects',
    'SELECT id FROM class_subjects WHERE section_id = ? AND subject_id = ? LIMIT 1',
    [sectionId, mathId],
    'INSERT INTO class_subjects (section_id, subject_id, teacher_id) VALUES (?, ?, ?)',
    [sectionId, mathId, teacherOneId]
  );

  await createIfMissing(
    'class_subjects',
    'SELECT id FROM class_subjects WHERE section_id = ? AND subject_id = ? LIMIT 1',
    [sectionId, engId],
    'INSERT INTO class_subjects (section_id, subject_id, teacher_id) VALUES (?, ?, ?)',
    [sectionId, engId, teacherTwoId]
  );

  const studentOneUserId = await createIfMissing(
    'users',
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    ['student1@example.com'],
    'INSERT INTO users (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
    [studentRoleId, 'Aarav Singh', 'student1@example.com', await bcrypt.hash('Student@123', BCRYPT_ROUNDS)]
  );

  const studentTwoUserId = await createIfMissing(
    'users',
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    ['student2@example.com'],
    'INSERT INTO users (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
    [studentRoleId, 'Diya Patel', 'student2@example.com', await bcrypt.hash('Student@123', BCRYPT_ROUNDS)]
  );

  const studentOneId = await createIfMissing(
    'students',
    'SELECT id FROM students WHERE user_id = ? LIMIT 1',
    [studentOneUserId],
    'INSERT INTO students (user_id, admission_no, dob, gender, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
    [studentOneUserId, 'ADM-1001', `${currentYear - 10}-02-14`, 'male', '9988776601', 'Block C, City']
  );

  const studentTwoId = await createIfMissing(
    'students',
    'SELECT id FROM students WHERE user_id = ? LIMIT 1',
    [studentTwoUserId],
    'INSERT INTO students (user_id, admission_no, dob, gender, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
    [studentTwoUserId, 'ADM-1002', `${currentYear - 10}-04-12`, 'female', '9988776602', 'Green Park, City']
  );

  await createIfMissing(
    'student_enrollments',
    'SELECT id FROM student_enrollments WHERE student_id = ? AND academic_year_id = ? LIMIT 1',
    [studentOneId, academicYearId],
    'INSERT INTO student_enrollments (student_id, section_id, academic_year_id, roll_no) VALUES (?, ?, ?, ?)',
    [studentOneId, sectionId, academicYearId, 1]
  );

  await createIfMissing(
    'student_enrollments',
    'SELECT id FROM student_enrollments WHERE student_id = ? AND academic_year_id = ? LIMIT 1',
    [studentTwoId, academicYearId],
    'INSERT INTO student_enrollments (student_id, section_id, academic_year_id, roll_no) VALUES (?, ?, ?, ?)',
    [studentTwoId, sectionId, academicYearId, 2]
  );

  const examId = await createIfMissing(
    'exams',
    'SELECT id FROM exams WHERE academic_year_id = ? AND class_id = ? AND name = ? LIMIT 1',
    [academicYearId, classId, 'Unit Test 1'],
    'INSERT INTO exams (academic_year_id, class_id, name, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
    [academicYearId, classId, 'Unit Test 1', isoDate(30), isoDate(7)]
  );

  const mathExamScheduleId = await createIfMissing(
    'exam_schedules',
    'SELECT id FROM exam_schedules WHERE exam_id = ? AND subject_id = ? LIMIT 1',
    [examId, mathId],
    'INSERT INTO exam_schedules (exam_id, subject_id, exam_date, start_time, max_marks, pass_marks) VALUES (?, ?, ?, ?, ?, ?)',
    [examId, mathId, isoDate(18), '09:00:00', 100, 40]
  );

  const engExamScheduleId = await createIfMissing(
    'exam_schedules',
    'SELECT id FROM exam_schedules WHERE exam_id = ? AND subject_id = ? LIMIT 1',
    [examId, engId],
    'INSERT INTO exam_schedules (exam_id, subject_id, exam_date, start_time, max_marks, pass_marks) VALUES (?, ?, ?, ?, ?, ?)',
    [examId, engId, isoDate(16), '10:30:00', 100, 40]
  );

  const marksByTeacherId = adminUserId || teacherOneUserId;
  const [existingMarks] = await pool.query('SELECT COUNT(*) AS n FROM marks WHERE exam_schedule_id IN (?, ?)', [mathExamScheduleId, engExamScheduleId]);
  if (existingMarks[0].n === 0) {
    await pool.query(
      'INSERT INTO marks (exam_schedule_id, student_id, marks_obtained, entered_by) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)',
      [mathExamScheduleId, studentOneId, 86, marksByTeacherId, mathExamScheduleId, studentTwoId, 72, marksByTeacherId, engExamScheduleId, studentOneId, 89, marksByTeacherId, engExamScheduleId, studentTwoId, 76, marksByTeacherId]
    );
  }

  const [attendanceRows] = await pool.query('SELECT COUNT(*) AS n FROM attendance WHERE section_id = ? AND subject_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)', [sectionId, mathId]);
  if (attendanceRows[0].n === 0) {
    const statuses = ['present', 'present', 'late', 'present', 'absent', 'present', 'present'];
    for (let i = 0; i < 7; i += 1) {
      const date = isoDate(6 - i);
      const studentIds = [studentOneId, studentTwoId];
      for (let s = 0; s < studentIds.length; s += 1) {
        await pool.query(
          'INSERT INTO attendance (student_id, section_id, subject_id, attendance_date, status, marked_by) VALUES (?, ?, ?, ?, ?, ?)',
          [studentIds[s], sectionId, mathId, date, statuses[(i + s) % statuses.length], marksByTeacherId]
        );
      }
    }
  }

  const [demoTeacherAttendanceCount] = await pool.query('SELECT COUNT(*) AS n FROM teacher_attendance WHERE teacher_id IN (?, ?) AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)', [teacherOneId, teacherTwoId]);
  if (demoTeacherAttendanceCount[0].n === 0) {
    const teacherStatuses = [
      [teacherOneId, ['present', 'present', 'late', 'present', 'present', 'absent', 'present']],
      [teacherTwoId, ['present', 'late', 'present', 'present', 'present', 'late', 'present']]
    ];
    for (const [teacherId, statuses] of teacherStatuses) {
      for (let i = 0; i < 7; i += 1) {
        await pool.query(
          'INSERT INTO teacher_attendance (teacher_id, attendance_date, status, marked_by) VALUES (?, ?, ?, ?)',
          [teacherId, isoDate(6 - i), statuses[i], adminUserId || teacherOneUserId]
        );
      }
    }
  }

  await pool.query('UPDATE sections SET class_teacher_id = ? WHERE id = ?', [teacherOneId, sectionId]);

  const teacherIds = [teacherOneId, teacherTwoId];
  const demoTeachers = [
    ['Neha Kapoor', 'teacher3@example.com', 'TCH-103', 'M.Sc. Physics'],
    ['Kabir Mehta', 'teacher4@example.com', 'TCH-104', 'M.A. History'],
    ['Sana Iqbal', 'teacher5@example.com', 'TCH-105', 'M.Sc. Biology'],
    ['Arjun Rao', 'teacher6@example.com', 'TCH-106', 'M.Com. Economics'],
    ['Meera Nair', 'teacher7@example.com', 'TCH-107', 'M.A. Geography'],
    ['Dev Malhotra', 'teacher8@example.com', 'TCH-108', 'M.Sc. Computer Science'],
  ];
  for (const [index, [teacherName, teacherEmail, employeeCode, qualification]] of demoTeachers.entries()) {
    const userId = await createIfMissing(
      'users',
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [teacherEmail],
      'INSERT INTO users (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
      [teacherRoleId, teacherName, teacherEmail, await bcrypt.hash('Teacher@123', BCRYPT_ROUNDS)]
    );
    const teacherId = await createIfMissing(
      'teachers',
      'SELECT id FROM teachers WHERE user_id = ? LIMIT 1',
      [userId],
      'INSERT INTO teachers (user_id, employee_code, phone, qualification, joined_on) VALUES (?, ?, ?, ?, ?)',
      [userId, employeeCode, `987650${String(3000 + index).slice(-4)}`, qualification, `${currentYear - 1}-06-15`]
    );
    teacherIds.push(teacherId);
  }

  const classSections = [];
  for (let grade = 6; grade <= 9; grade += 1) {
    const demoClassId = await createIfMissing(
      'classes',
      'SELECT id FROM classes WHERE academic_year_id = ? AND name = ? LIMIT 1',
      [academicYearId, `Class ${grade}`],
      'INSERT INTO classes (academic_year_id, name) VALUES (?, ?)',
      [academicYearId, `Class ${grade}`]
    );
    for (const sectionName of ['A', 'B']) {
      const demoSectionId = await createIfMissing(
        'sections',
        'SELECT id FROM sections WHERE class_id = ? AND name = ? LIMIT 1',
        [demoClassId, sectionName],
        'INSERT INTO sections (class_id, name) VALUES (?, ?)',
        [demoClassId, sectionName]
      );
      const assignmentIndex = (grade - 6) * 2 + (sectionName === 'B' ? 1 : 0);
      const classTeacherId = teacherIds[assignmentIndex % teacherIds.length];
      await pool.query('UPDATE sections SET class_teacher_id = ? WHERE id = ?', [classTeacherId, demoSectionId]);
      await createIfMissing(
        'class_subjects',
        'SELECT id FROM class_subjects WHERE section_id = ? AND subject_id = ? LIMIT 1',
        [demoSectionId, mathId],
        'INSERT INTO class_subjects (section_id, subject_id, teacher_id) VALUES (?, ?, ?)',
        [demoSectionId, mathId, classTeacherId]
      );
      await createIfMissing(
        'class_subjects',
        'SELECT id FROM class_subjects WHERE section_id = ? AND subject_id = ? LIMIT 1',
        [demoSectionId, engId],
        'INSERT INTO class_subjects (section_id, subject_id, teacher_id) VALUES (?, ?, ?)',
        [demoSectionId, engId, teacherIds[(assignmentIndex + 1) % teacherIds.length]]
      );
      classSections.push({ classId: demoClassId, sectionId: demoSectionId, grade, sectionName });
    }
  }

  const firstNames = ['Aarav', 'Anaya', 'Ishaan', 'Myra', 'Vivaan', 'Aadhya', 'Reyansh', 'Sara', 'Kabir', 'Ira'];
  const lastNames = ['Shah', 'Reddy', 'Joshi', 'Khan', 'Bose', 'Iyer', 'Das', 'Gill', 'Saxena', 'Menon'];
  const demoStudentCount = classSections.length * 5;
  for (let index = 0; index < demoStudentCount; index += 1) {
    const section = classSections[Math.floor(index / 5)];
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[Math.floor(index / firstNames.length)];
    const studentName = `${firstName} ${lastName}`;
    const serial = String(index + 1).padStart(3, '0');
    const email = `demo.student${serial}@example.com`;
    const userId = await createIfMissing(
      'users',
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email],
      'INSERT INTO users (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
      [studentRoleId, studentName, email, await bcrypt.hash('Student@123', BCRYPT_ROUNDS)]
    );
    const studentId = await createIfMissing(
      'students',
      'SELECT id FROM students WHERE user_id = ? LIMIT 1',
      [userId],
      'INSERT INTO students (user_id, admission_no, dob, gender, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, `ADM-${1100 + index}`, `${currentYear - section.grade - 4}-03-15`, index % 2 ? 'female' : 'male', `998877${String(7000 + index).slice(-4)}`, 'Demo Campus, City']
    );
    const [[rollRow]] = await pool.query(
      'SELECT COALESCE(MAX(roll_no), 0) + 1 AS nextRollNo FROM student_enrollments WHERE section_id = ? AND academic_year_id = ?',
      [section.sectionId, academicYearId]
    );
    await createIfMissing(
      'student_enrollments',
      'SELECT id FROM student_enrollments WHERE student_id = ? AND academic_year_id = ? LIMIT 1',
      [studentId, academicYearId],
      'INSERT INTO student_enrollments (student_id, section_id, academic_year_id, roll_no) VALUES (?, ?, ?, ?)',
      [studentId, section.sectionId, academicYearId, rollRow.nextRollNo]
    );

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const status = ['present', 'present', 'present', 'late', 'absent', 'present', 'present'][(index + dayIndex) % 7];
      await pool.query(
        'INSERT IGNORE INTO attendance (student_id, section_id, subject_id, attendance_date, status, marked_by) VALUES (?, ?, ?, ?, ?, ?)',
        [studentId, section.sectionId, mathId, isoDate(6 - dayIndex), status, adminUserId || teacherOneUserId]
      );
    }
  }

  const teacherStatuses = ['present', 'present', 'present', 'present', 'late', 'present', 'absent'];
  for (const [teacherIndex, teacherId] of teacherIds.entries()) {
    for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
      await pool.query(
        'INSERT IGNORE INTO teacher_attendance (teacher_id, attendance_date, status, marked_by) VALUES (?, ?, ?, ?)',
        [teacherId, isoDate(29 - dayIndex), teacherStatuses[(teacherIndex + dayIndex) % teacherStatuses.length], adminUserId || teacherOneUserId]
      );
    }
  }

  console.log(`Demo dashboard data ensured: ${classSections.length / 2} classes, ${classSections.length} sections, ${demoStudentCount + 2} students, ${teacherIds.length} teachers.`);
}

(async () => {
  for (const role of ROLES) await pool.query('INSERT IGNORE INTO roles (name) VALUES (?)', [role]);

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM grade_scale');
  if (n === 0) {
    for (const [grade, min, max] of GRADES) {
      await pool.query('INSERT INTO grade_scale (grade, min_percent, max_percent) VALUES (?, ?, ?)', [grade, min, max]);
    }
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || 'School Admin').trim();
  if (!email || password.length < 10) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 characters) in .env before seeding.');
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    console.log(`Admin ${email} already exists - left unchanged.`);
  } else {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query(
      'INSERT INTO users (role_id, name, email, password_hash) VALUES ((SELECT id FROM roles WHERE name = "admin"), ?, ?, ?)',
      [name, email, hash]
    );
    console.log(`Admin account created for ${email}.`);
  }

  await ensureDemoData();
  console.log('Seed complete.');
})()
  .catch((err) => { console.error('Seed failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
