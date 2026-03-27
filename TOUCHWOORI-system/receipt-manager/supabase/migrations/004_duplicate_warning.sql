ALTER TABLE receipts ADD COLUMN IF NOT EXISTS has_duplicate_warning boolean DEFAULT false;
