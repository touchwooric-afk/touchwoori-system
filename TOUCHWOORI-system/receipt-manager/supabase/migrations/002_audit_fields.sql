-- ============================================
-- 002: settlements 테이블 감사 내역 필드 추가
-- ============================================

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS audit_file_url TEXT,
  ADD COLUMN IF NOT EXISTS audit_note TEXT CHECK (audit_note IS NULL OR char_length(audit_note) <= 1000);
