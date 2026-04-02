-- ============================================
-- 008: departments 테이블, user_departments, overseer/admin_viewer 역할 추가
-- ============================================

-- ============================================
-- 1. departments 테이블
-- ============================================
CREATE TABLE departments (
  id TEXT PRIMARY KEY,                          -- '고등부', '중등부' 등 식별자
  name TEXT NOT NULL,                           -- 표시명: '터치우리 고등부'
  parent_id TEXT REFERENCES departments(id),    -- 상위 부서 (예: 교육부서 산하)
  type TEXT NOT NULL DEFAULT 'education'        -- 'education' | 'committee' | 'admin'
    CHECK (type IN ('education', 'committee', 'admin')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기존 부서 시드 데이터
INSERT INTO departments (id, name, type, sort_order) VALUES
  ('고등부', '터치우리 고등부', 'education', 1),
  ('중등부', '드림우리 중등부', 'education', 2);

-- ============================================
-- 2. user_departments 테이블 (accountant 겸임 부서)
-- ============================================
CREATE TABLE user_departments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_departments_user ON user_departments(user_id);
CREATE INDEX idx_user_departments_dept ON user_departments(department_id);

-- ============================================
-- 3. users.role — overseer / admin_viewer 추가
-- ============================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'master',
    'sub_master',
    'accountant',
    'auditor',
    'teacher',
    'overseer',
    'admin_viewer'
  ));

-- ============================================
-- 4. RLS 정책 업데이트
-- ============================================

-- departments: 전체 공개 읽기, master만 쓰기
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments_select" ON departments FOR SELECT USING (true);
CREATE POLICY "departments_insert_master" ON departments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);
CREATE POLICY "departments_update_master" ON departments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);

-- user_departments: master/sub_master 관리, 본인 조회 가능
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_departments_select" ON user_departments FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'sub_master'))
);
CREATE POLICY "user_departments_manage" ON user_departments FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'sub_master'))
);

-- Ledgers: overseer / admin_viewer 전체 조회 허용
DROP POLICY IF EXISTS "ledgers_select" ON ledgers;
CREATE POLICY "ledgers_select" ON ledgers FOR SELECT USING (
  department_id = (SELECT department_id FROM users WHERE id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('master', 'sub_master', 'auditor', 'overseer', 'admin_viewer')
  )
);

-- Ledger Entries: overseer / admin_viewer 전체 조회 허용
DROP POLICY IF EXISTS "ledger_entries_select" ON ledger_entries;
CREATE POLICY "ledger_entries_select" ON ledger_entries FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ledgers l
    WHERE l.id = ledger_entries.ledger_id
    AND (
      l.department_id = (SELECT department_id FROM users WHERE id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role IN ('master', 'sub_master', 'auditor', 'overseer', 'admin_viewer')
      )
    )
  )
);

-- Receipts: overseer / admin_viewer 전체 조회 허용
DROP POLICY IF EXISTS "receipts_select" ON receipts;
CREATE POLICY "receipts_select" ON receipts FOR SELECT USING (
  submitted_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('master', 'sub_master', 'accountant', 'auditor', 'overseer', 'admin_viewer')
  )
);
