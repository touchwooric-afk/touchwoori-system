-- excel_syncs에 ledger_id 추가 (롤백 시 장부 단위 필터링용)
ALTER TABLE excel_syncs ADD COLUMN IF NOT EXISTS ledger_id uuid REFERENCES ledgers(id);
