-- School ERP schema (MySQL 8 / InnoDB / utf8mb4)
-- Applied by `npm run db:migrate`. Safe to re-run: every table uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(20) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id TINYINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_years (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_year_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teachers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  employee_code VARCHAR(30) NOT NULL,
  phone VARCHAR(20) NULL,
  qualification VARCHAR(150) NULL,
  joined_on DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teachers_user (user_id),
  UNIQUE KEY uq_teachers_code (employee_code),
  CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS classes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  academic_year_id INT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_class_year_name (academic_year_id, name),
  CONSTRAINT fk_classes_year FOREIGN KEY (academic_year_id) REFERENCES academic_years (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sections (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id INT UNSIGNED NOT NULL,
  name VARCHAR(20) NOT NULL,
  class_teacher_id INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_section_class_name (class_id, name),
  KEY idx_sections_teacher (class_teacher_id),
  CONSTRAINT fk_sections_class FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT fk_sections_teacher FOREIGN KEY (class_teacher_id) REFERENCES teachers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  code VARCHAR(20) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subjects_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_subjects (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cs_section_subject (section_id, subject_id),
  KEY idx_cs_teacher (teacher_id),
  CONSTRAINT fk_cs_section FOREIGN KEY (section_id) REFERENCES sections (id),
  CONSTRAINT fk_cs_subject FOREIGN KEY (subject_id) REFERENCES subjects (id),
  CONSTRAINT fk_cs_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  admission_no VARCHAR(30) NOT NULL,
  dob DATE NULL,
  gender ENUM('male','female','other') NULL,
  phone VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_user (user_id),
  UNIQUE KEY uq_students_admission (admission_no),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_enrollments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  section_id INT UNSIGNED NOT NULL,
  academic_year_id INT UNSIGNED NOT NULL,
  roll_no INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enroll_student_year (student_id, academic_year_id),
  UNIQUE KEY uq_enroll_section_roll (section_id, roll_no),
  KEY idx_enroll_year (academic_year_id),
  CONSTRAINT fk_enroll_student FOREIGN KEY (student_id) REFERENCES students (id),
  CONSTRAINT fk_enroll_section FOREIGN KEY (section_id) REFERENCES sections (id),
  CONSTRAINT fk_enroll_year FOREIGN KEY (academic_year_id) REFERENCES academic_years (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  phone VARCHAR(20) NULL,
  occupation VARCHAR(100) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parents_user (user_id),
  CONSTRAINT fk_parents_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parent_students (
  parent_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  relation VARCHAR(30) NOT NULL DEFAULT 'guardian',
  PRIMARY KEY (parent_id, student_id),
  KEY idx_ps_student (student_id),
  CONSTRAINT fk_ps_parent FOREIGN KEY (parent_id) REFERENCES parents (id),
  CONSTRAINT fk_ps_student FOREIGN KEY (student_id) REFERENCES students (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  section_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','leave') NOT NULL,
  marked_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att_student_subject_date (student_id, subject_id, attendance_date),
  KEY idx_att_section_date (section_id, attendance_date),
  KEY idx_att_date (attendance_date),
  CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES students (id),
  CONSTRAINT fk_att_section FOREIGN KEY (section_id) REFERENCES sections (id),
  CONSTRAINT fk_att_subject FOREIGN KEY (subject_id) REFERENCES subjects (id),
  CONSTRAINT fk_att_marker FOREIGN KEY (marked_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS timetable (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL COMMENT '1=Monday ... 7=Sunday',
  period_no TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(30) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tt_section_slot (section_id, day_of_week, period_no),
  UNIQUE KEY uq_tt_teacher_slot (teacher_id, day_of_week, period_no),
  CONSTRAINT fk_tt_section FOREIGN KEY (section_id) REFERENCES sections (id),
  CONSTRAINT fk_tt_subject FOREIGN KEY (subject_id) REFERENCES subjects (id),
  CONSTRAINT fk_tt_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id),
  CONSTRAINT chk_tt_day CHECK (day_of_week BETWEEN 1 AND 7)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exams (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  academic_year_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_class_name (class_id, academic_year_id, name),
  CONSTRAINT fk_exams_year FOREIGN KEY (academic_year_id) REFERENCES academic_years (id),
  CONSTRAINT fk_exams_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  exam_date DATE NOT NULL,
  start_time TIME NULL,
  max_marks DECIMAL(6,2) NOT NULL,
  pass_marks DECIMAL(6,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_es_exam_subject (exam_id, subject_id),
  KEY idx_es_date (exam_date),
  CONSTRAINT fk_es_exam FOREIGN KEY (exam_id) REFERENCES exams (id),
  CONSTRAINT fk_es_subject FOREIGN KEY (subject_id) REFERENCES subjects (id),
  CONSTRAINT chk_es_marks CHECK (pass_marks <= max_marks AND max_marks > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_schedule_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  marks_obtained DECIMAL(6,2) NOT NULL,
  entered_by INT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marks_schedule_student (exam_schedule_id, student_id),
  KEY idx_marks_student (student_id),
  CONSTRAINT fk_marks_schedule FOREIGN KEY (exam_schedule_id) REFERENCES exam_schedules (id),
  CONSTRAINT fk_marks_student FOREIGN KEY (student_id) REFERENCES students (id),
  CONSTRAINT fk_marks_user FOREIGN KEY (entered_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grade_scale (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  grade VARCHAR(5) NOT NULL,
  min_percent DECIMAL(5,2) NOT NULL,
  max_percent DECIMAL(5,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grade (grade)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_subject_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  due_date DATE NOT NULL,
  file_path VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_asg_cs_due (class_subject_id, due_date),
  CONSTRAINT fk_asg_cs FOREIGN KEY (class_subject_id) REFERENCES class_subjects (id),
  CONSTRAINT fk_asg_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('submitted','reviewed') NOT NULL DEFAULT 'submitted',
  feedback TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sub_assignment_student (assignment_id, student_id),
  KEY idx_sub_student (student_id),
  CONSTRAINT fk_sub_assignment FOREIGN KEY (assignment_id) REFERENCES assignments (id),
  CONSTRAINT fk_sub_student FOREIGN KEY (student_id) REFERENCES students (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_materials (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_subject_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  file_path VARCHAR(255) NOT NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sm_cs (class_subject_id),
  CONSTRAINT fk_sm_cs FOREIGN KEY (class_subject_id) REFERENCES class_subjects (id),
  CONSTRAINT fk_sm_user FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fee_structures (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  academic_year_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  fee_type VARCHAR(80) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fee_class_type (academic_year_id, class_id, fee_type),
  CONSTRAINT fk_fs_year FOREIGN KEY (academic_year_id) REFERENCES academic_years (id),
  CONSTRAINT fk_fs_class FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT chk_fs_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fee_payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  fee_structure_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid_on DATE NOT NULL,
  method ENUM('cash','upi','card','bank_transfer','cheque') NOT NULL DEFAULT 'cash',
  receipt_no VARCHAR(30) NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_receipt (receipt_no),
  KEY idx_pay_student (student_id),
  KEY idx_pay_structure (fee_structure_id),
  KEY idx_pay_date (paid_on),
  CONSTRAINT fk_pay_student FOREIGN KEY (student_id) REFERENCES students (id),
  CONSTRAINT fk_pay_structure FOREIGN KEY (fee_structure_id) REFERENCES fee_structures (id),
  CONSTRAINT fk_pay_user FOREIGN KEY (recorded_by) REFERENCES users (id),
  CONSTRAINT chk_pay_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notices (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  audience ENUM('all','teachers','students','parents') NOT NULL DEFAULT 'all',
  class_id INT UNSIGNED NULL,
  attachment_path VARCHAR(255) NULL,
  publish_date DATE NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notices_publish (publish_date),
  KEY idx_notices_class (class_id),
  CONSTRAINT fk_notices_class FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT fk_notices_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  event_type ENUM('exam','sports_day','annual_function','ptm','holiday','other') NOT NULL DEFAULT 'other',
  start_date DATE NOT NULL,
  end_date DATE NULL,
  created_by INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_events_start (start_date),
  CONSTRAINT fk_events_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500) NULL,
  link VARCHAR(255) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user_read (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teacher_remarks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  remark VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_remarks_student (student_id),
  CONSTRAINT fk_remarks_student FOREIGN KEY (student_id) REFERENCES students (id),
  CONSTRAINT fk_remarks_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60) NULL,
  entity_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_created (created_at),
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;
