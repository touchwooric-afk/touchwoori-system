-- ============================================
-- 012: 재적 관리 확장 (장결 및 담임 배정)
-- ============================================

ALTER TABLE attendance_members
  ADD COLUMN is_long_absent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN homeroom_teacher_id UUID REFERENCES attendance_members(id) ON DELETE SET NULL;

ALTER TABLE attendance_members
  ADD CONSTRAINT attendance_student_management_fields CHECK (
    (member_type = 'teacher' AND is_long_absent = false AND homeroom_teacher_id IS NULL)
    OR member_type = 'student'
  );

CREATE INDEX idx_attendance_members_homeroom_teacher
  ON attendance_members(homeroom_teacher_id)
  WHERE homeroom_teacher_id IS NOT NULL;
