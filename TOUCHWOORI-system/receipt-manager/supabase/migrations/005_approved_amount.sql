-- 승인 금액 컬럼 추가 (회계교사가 통장 확인 후 금액 조정 가능)
-- final_amount: 교사가 제출한 원본 금액 (변경 불가)
-- approved_amount: 회계교사가 승인 시 조정한 금액 (NULL이면 final_amount와 동일)
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS approved_amount integer;
