CREATE TABLE IF NOT EXISTS teacher_attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','leave') NOT NULL,
  marked_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teacher_attendance_date (teacher_id, attendance_date),
  KEY idx_teacher_attendance_date (attendance_date),
  CONSTRAINT fk_teacher_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id),
  CONSTRAINT fk_teacher_attendance_marker FOREIGN KEY (marked_by) REFERENCES users (id)
) ENGINE=InnoDB;
