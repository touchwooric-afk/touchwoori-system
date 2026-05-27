-- receipts SELECT RLS: teacher 역할도 본인 부서 영수증 조회 허용
-- 기존 정책은 teacher를 제외하여 장부/PDF에서 다른 사용자 영수증이 보이지 않는 버그 발생
DROP POLICY IF EXISTS "receipts_select" ON receipts;
CREATE POLICY "receipts_select" ON receipts FOR SELECT USING (
  -- 본인 제출 영수증은 항상 조회 가능
  submitted_by = auth.uid()
  -- 전 부서 접근 역할 (부서 제한 없음)
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('master', 'sub_master', 'auditor', 'overseer', 'admin_viewer')
  )
  -- accountant, teacher: 본인 부서 영수증만
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('accountant', 'teacher')
    AND department_id = receipts.department_id
  )
);
