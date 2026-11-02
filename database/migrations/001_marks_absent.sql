-- Lets a teacher record that a student was absent for an exam (marks_obtained is stored as 0).
ALTER TABLE marks ADD COLUMN is_absent TINYINT(1) NOT NULL DEFAULT 0;
