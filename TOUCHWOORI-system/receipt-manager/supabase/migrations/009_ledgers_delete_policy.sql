-- ============================================
-- 009: ledgers DELETE 정책 추가
-- ============================================

-- master만 특수 장부(type='special') 삭제 가능
-- 본 장부(type='main')는 삭제 불가 (API에서도 이중 차단)
CREATE POLICY "ledgers_delete_master" ON ledgers FOR DELETE USING (
  type = 'special'
  AND is_active = false
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);
