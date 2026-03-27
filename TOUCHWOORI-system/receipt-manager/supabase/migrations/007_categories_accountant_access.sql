-- accountant도 카테고리 추가/수정 가능하도록 RLS 정책 확장
-- (삭제는 별도 정책 없으므로 master만 유지)

DROP POLICY IF EXISTS "categories_insert_master" ON categories;
DROP POLICY IF EXISTS "categories_update_master" ON categories;

CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('master', 'accountant')
      AND status = 'active'
  )
);

CREATE POLICY "categories_update" ON categories FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('master', 'accountant')
      AND status = 'active'
  )
);
