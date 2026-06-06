ALTER TABLE attendance_members
  DROP CONSTRAINT IF EXISTS attendance_members_grade_check;

ALTER TABLE attendance_members
  ADD CONSTRAINT attendance_members_grade_check CHECK (
    (member_type = 'teacher' AND (grade IS NULL OR grade BETWEEN 1 AND 3))
    OR (member_type = 'student' AND grade IS NOT NULL AND grade BETWEEN 1 AND 3)
  );
