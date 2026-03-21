-- ============================================
-- 003: sub_master / auditor role 추가
-- ============================================

-- 1. users.role CHECK 제약 조건 업데이트
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('master', 'sub_master', 'accountant', 'auditor', 'teacher'));

-- 2. RLS 정책 업데이트 — sub_master / auditor 읽기 허용

-- Ledgers: sub_master + auditor는 모든 부서 장부 조회 가능
DROP POLICY IF EXISTS "ledgers_select" ON ledgers;
CREATE POLICY "ledgers_select" ON ledgers FOR SELECT USING (
  department_id = (SELECT department_id FROM users WHERE id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('master', 'sub_master', 'auditor')
  )
);

-- Ledger Entries: sub_master + auditor 읽기 허용
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
        AND role IN ('master', 'sub_master', 'auditor')
      )
    )
  )
);

-- Receipts: sub_master + auditor 읽기 허용
DROP POLICY IF EXISTS "receipts_select" ON receipts;
CREATE POLICY "receipts_select" ON receipts FOR SELECT USING (
  submitted_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('master', 'sub_master', 'accountant', 'auditor')
  )
);
