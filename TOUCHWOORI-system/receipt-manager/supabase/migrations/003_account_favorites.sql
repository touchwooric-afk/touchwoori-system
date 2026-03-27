-- 1. account_favorites 테이블 (계좌 즐겨찾기)
CREATE TABLE IF NOT EXISTS account_favorites (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          text        NOT NULL,
  bank_name      text        NOT NULL,
  account_holder text        NOT NULL,
  account_number text        NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE account_favorites ENABLE ROW LEVEL SECURITY;

-- 본인만 읽기/쓰기/삭제 가능 (master 포함 타인 접근 불가)
CREATE POLICY "account_favorites_owner_only"
  ON account_favorites
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. receipts 테이블에 은행 정보 컬럼 추가
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS bank_name      text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS account_holder text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS account_number text;
