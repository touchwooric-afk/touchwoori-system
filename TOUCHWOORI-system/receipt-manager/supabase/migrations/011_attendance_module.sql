-- ============================================
-- 011: 출석 관리 모듈
-- ============================================

CREATE TABLE attendance_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id TEXT NOT NULL REFERENCES departments(id),
  member_type TEXT NOT NULL CHECK (member_type IN ('student', 'teacher')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  grade INTEGER CHECK (
    (member_type = 'teacher' AND grade IS NULL)
    OR (member_type = 'student' AND grade IS NOT NULL AND grade BETWEEN 1 AND 3)
  ),
  position TEXT,
  is_homeroom BOOLEAN NOT NULL DEFAULT false,
  student_kind TEXT CHECK (
    (member_type = 'teacher' AND student_kind IS NULL)
    OR (member_type = 'student' AND student_kind IS NOT NULL AND student_kind IN ('enrolled', 'newcomer'))
  ),
  active_from DATE NOT NULL DEFAULT CURRENT_DATE,
  active_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT CHECK (memo IS NULL OR char_length(memo) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (active_until IS NULL OR active_until >= active_from)
);

CREATE TABLE attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id TEXT NOT NULL REFERENCES departments(id),
  attendance_date DATE NOT NULL,
  week_label TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '주일예배',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, attendance_date, title)
);

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES attendance_members(id),
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late')),
  checked_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, member_id)
);

CREATE INDEX idx_attendance_members_department ON attendance_members(department_id, member_type, is_active);
CREATE INDEX idx_attendance_sessions_department_date ON attendance_sessions(department_id, attendance_date DESC);
CREATE INDEX idx_attendance_records_session ON attendance_records(session_id);

CREATE TRIGGER attendance_members_updated_at
  BEFORE UPDATE ON attendance_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER attendance_sessions_updated_at
  BEFORE UPDATE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER attendance_records_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE attendance_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_members_select" ON attendance_members FOR SELECT USING (
  department_id = (SELECT department_id FROM users WHERE id = auth.uid() AND status = 'active')
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND status = 'active'
    AND role IN ('master', 'sub_master', 'overseer', 'admin_viewer')
  )
);

CREATE POLICY "attendance_sessions_select" ON attendance_sessions FOR SELECT USING (
  department_id = (SELECT department_id FROM users WHERE id = auth.uid() AND status = 'active')
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND status = 'active'
    AND role IN ('master', 'sub_master', 'overseer', 'admin_viewer')
  )
);

CREATE POLICY "attendance_records_select" ON attendance_records FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM attendance_sessions s
    WHERE s.id = attendance_records.session_id
    AND (
      s.department_id = (SELECT department_id FROM users WHERE id = auth.uid() AND status = 'active')
      OR EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND status = 'active'
        AND role IN ('master', 'sub_master', 'overseer', 'admin_viewer')
      )
    )
  )
);

-- API 라우트가 권한을 확인한 뒤 service client로 변경을 수행합니다.

INSERT INTO attendance_members
  (department_id, member_type, name, position, is_homeroom, active_from, active_until, student_kind, memo)
VALUES
  ('고등부', 'teacher', '박종혁', '부장교사', false, '2026-05-31', null, null, null),
  ('고등부', 'teacher', '김태용', '총무교사', true, '2026-05-31', '2026-05-31', null, '2026년 5월 31일 주일예배 이후 사임'),
  ('고등부', 'teacher', '민해찬', '교사', true, '2026-05-31', null, null, null),
  ('고등부', 'teacher', '송재훈', '교사', false, '2026-05-31', null, null, null),
  ('고등부', 'teacher', '최서윤', '교사', true, '2026-05-31', null, null, null);

INSERT INTO attendance_members
  (department_id, member_type, name, grade, student_kind, active_from)
VALUES
  ('고등부', 'student', '전민서', 1, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '김지윤', 1, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '김승휘', 1, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '김예솔', 1, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '이지환', 2, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '김지우', 2, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '김건우', 2, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '황주원', 2, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '김의찬', 2, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '이찬희', 2, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '유한서', 3, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '박건우', 3, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '권예진', 3, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '최시준', 3, 'enrolled', '2026-05-31'),
  ('고등부', 'student', '김해솔', 3, 'enrolled', '2026-05-31');
