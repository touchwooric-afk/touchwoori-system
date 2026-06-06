DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'attendance_members'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%member_type%'
      AND pg_get_constraintdef(oid) ILIKE '%grade%'
  LOOP
    EXECUTE format(
      'ALTER TABLE attendance_members DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END
$$;

ALTER TABLE attendance_members
  ADD CONSTRAINT attendance_members_grade_check CHECK (
    (member_type = 'teacher' AND (grade IS NULL OR grade BETWEEN 1 AND 3))
    OR (member_type = 'student' AND grade IS NOT NULL AND grade BETWEEN 1 AND 3)
  );
