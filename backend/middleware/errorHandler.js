function notFound(req, res, next) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  res.status(404).send('Page not found.');
}

// Friendly messages for unique-key violations, keyed by the index name in schema.sql.
const DUPLICATE_MESSAGES = {
  uq_users_email: 'That email address is already in use.',
  uq_students_admission: 'That admission number already exists.',
  uq_teachers_code: 'That employee code already exists.',
  uq_year_name: 'An academic year with that name already exists.',
  uq_class_year_name: 'That class already exists in this academic year.',
  uq_section_class_name: 'That section already exists in this class.',
  uq_subjects_code: 'That subject code already exists.',
  uq_cs_section_subject: 'This subject is already assigned to this section.',
  uq_enroll_section_roll: 'That roll number is already taken in this section.',
  uq_exam_class_name: 'This class already has an exam with that name this year.',
  uq_es_exam_subject: 'That subject is already scheduled for this exam.',
  uq_fee_class_type: 'This class already has a fee with that name this year.',
  uq_payment_receipt: 'Could not create a unique receipt number. Please try again.',
  uq_grade: 'Each grade can only appear once.',
  uq_tt_teacher_slot: 'This teacher already has a class in that period.',
  uq_tt_section_slot: 'This section already has a class in that period.',
};

function mapDatabaseError(err) {
  if (err.code === 'ER_DUP_ENTRY' || err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    const detail = String(err.sqlMessage || err.message || '').toLowerCase();
    const sqliteKeys = {
      'users.email': 'uq_users_email',
      'students.admission_no': 'uq_students_admission',
      'teachers.employee_code': 'uq_teachers_code',
      'academic_years.name': 'uq_year_name',
      'classes.academic_year_id, classes.name': 'uq_class_year_name',
      'sections.class_id, sections.name': 'uq_section_class_name',
      'subjects.code': 'uq_subjects_code',
      'class_subjects.section_id, class_subjects.subject_id': 'uq_cs_section_subject',
      'student_enrollments.section_id, student_enrollments.roll_no': 'uq_enroll_section_roll',
      'exams.class_id, exams.academic_year_id, exams.name': 'uq_exam_class_name',
      'exam_schedules.exam_id, exam_schedules.subject_id': 'uq_es_exam_subject',
      'fee_structures.academic_year_id, fee_structures.class_id, fee_structures.fee_type': 'uq_fee_class_type',
      'fee_payments.receipt_no': 'uq_payment_receipt',
      'grade_scale.grade': 'uq_grade',
      'timetable.teacher_id, timetable.day_of_week, timetable.period_no': 'uq_tt_teacher_slot',
      'timetable.section_id, timetable.day_of_week, timetable.period_no': 'uq_tt_section_slot',
    };
    const sqliteKey = Object.entries(sqliteKeys).find(([columns]) => detail.includes(columns))?.[1];
    const key = sqliteKey || Object.keys(DUPLICATE_MESSAGES).find((name) => detail.includes(name));
    return { status: 409, message: key ? DUPLICATE_MESSAGES[key] : 'That value already exists.' };
  }
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return err.sqlOperation === 'DELETE'
      ? { status: 409, message: "This record is used elsewhere, so it can't be deleted." }
      : { status: 422, message: 'One of the selected items no longer exists. Refresh and try again.' };
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    return { status: 409, message: "This record is used elsewhere, so it can't be deleted." };
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    return { status: 422, message: 'One of the selected items no longer exists. Refresh and try again.' };
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too large. The limit is 10 MB.' });
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || (err.name === 'MulterError')) return res.status(422).json({ error: 'Upload one file only.' });
  const mapped = !err.expose && mapDatabaseError(err);
  if (mapped) return res.status(mapped.status).json({ error: mapped.message });

  const status = err.status || 500;
  if (status >= 500) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'request_failed',
      method: req.method,
      path: req.path,
      status,
      error: {
        name: err.name || 'UnknownError',
        message: err.message || String(err),
        code: err.code || null,
        stack: err.stack || null,
        causes: Array.isArray(err.errors) ? err.errors.map((cause) => ({ message: cause.message, code: cause.code })) : [],
      },
    }));
  }
  res.status(status).json({
    error: err.expose ? err.message : 'Something went wrong on our side. Please try again.',
    ...(err.expose && err.code ? { code: err.code } : {}),
  });
}

module.exports = { notFound, errorHandler };
