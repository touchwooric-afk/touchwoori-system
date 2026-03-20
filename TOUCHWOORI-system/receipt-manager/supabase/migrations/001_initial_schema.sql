-- ============================================
-- TOUCHWOORI 고등부 영수증 관리 시스템 - 초기 스키마
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 직분 (Position)
-- ============================================
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 사용자 (User) - Supabase Auth 확장
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  department_id TEXT NOT NULL DEFAULT '고등부',
  position TEXT NOT NULL,
  role TEXT CHECK (role IN ('master', 'accountant', 'teacher')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 분류 (Category)
-- ============================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  keywords JSONB DEFAULT '[]'::jsonb,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 장부 (Ledger)
-- ============================================
CREATE TABLE ledgers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id TEXT NOT NULL DEFAULT '고등부',
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('main', 'special')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

-- ============================================
-- 결산기 (Settlement)
-- ============================================
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  memo TEXT CHECK (memo IS NULL OR char_length(memo) <= 500),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- ============================================
-- 영수증 (Receipt)
-- ============================================
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id TEXT NOT NULL DEFAULT '고등부',
  settlement_id UUID REFERENCES settlements(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  submitted_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  date DATE NOT NULL,
  subtotal INTEGER DEFAULT 0 CHECK (subtotal IS NULL OR (subtotal >= 0 AND subtotal <= 99999999)),
  discount INTEGER DEFAULT 0 CHECK (discount IS NULL OR (discount >= 0 AND discount <= 99999999)),
  delivery_fee INTEGER DEFAULT 0 CHECK (delivery_fee IS NULL OR (delivery_fee >= 0 AND delivery_fee <= 99999999)),
  final_amount INTEGER NOT NULL CHECK (final_amount >= 0 AND final_amount <= 99999999),
  vendor TEXT,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  image_url TEXT,
  ocr_raw TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT CHECK (reject_reason IS NULL OR char_length(reject_reason) <= 200),
  memo TEXT CHECK (memo IS NULL OR char_length(memo) <= 500),
  pdf_crop JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 장부항목 (LedgerEntry)
-- ============================================
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES receipts(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  date DATE NOT NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  income INTEGER NOT NULL DEFAULT 0 CHECK (income >= 0 AND income <= 99999999),
  expense INTEGER NOT NULL DEFAULT 0 CHECK (expense >= 0 AND expense <= 99999999),
  memo TEXT CHECK (memo IS NULL OR char_length(memo) <= 500),
  source TEXT NOT NULL CHECK (source IN ('receipt', 'manual', 'excel_import')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 엑셀 동기화 이력 (ExcelSync)
-- ============================================
CREATE TABLE excel_syncs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('import', 'export')),
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  error_log TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_receipts_status ON receipts(status);
CREATE INDEX idx_receipts_submitted_by ON receipts(submitted_by);
CREATE INDEX idx_receipts_date ON receipts(date);
CREATE INDEX idx_receipts_department ON receipts(department_id);
CREATE INDEX idx_ledger_entries_ledger ON ledger_entries(ledger_id);
CREATE INDEX idx_ledger_entries_date ON ledger_entries(date);
CREATE INDEX idx_ledger_entries_receipt ON ledger_entries(receipt_id);
CREATE INDEX idx_categories_type ON categories(type);
CREATE INDEX idx_categories_active ON categories(is_active);

-- ============================================
-- updated_at 자동 업데이트 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ledger_entries_updated_at
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE excel_syncs ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "users_select" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_self" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_update_master" ON users FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);

-- Categories
CREATE POLICY "categories_select" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_insert_master" ON categories FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);
CREATE POLICY "categories_update_master" ON categories FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);

-- Positions
CREATE POLICY "positions_select" ON positions FOR SELECT USING (true);
CREATE POLICY "positions_insert_master" ON positions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);
CREATE POLICY "positions_update_master" ON positions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);

-- Ledgers
CREATE POLICY "ledgers_select" ON ledgers FOR SELECT USING (
  department_id = (SELECT department_id FROM users WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);
CREATE POLICY "ledgers_insert" ON ledgers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);
CREATE POLICY "ledgers_update" ON ledgers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);

-- Ledger Entries
CREATE POLICY "ledger_entries_select" ON ledger_entries FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ledgers l
    WHERE l.id = ledger_entries.ledger_id
    AND (l.department_id = (SELECT department_id FROM users WHERE id = auth.uid())
         OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master'))
  )
);
CREATE POLICY "ledger_entries_insert" ON ledger_entries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);
CREATE POLICY "ledger_entries_update" ON ledger_entries FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);
CREATE POLICY "ledger_entries_delete" ON ledger_entries FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);

-- Receipts
CREATE POLICY "receipts_select" ON receipts FOR SELECT USING (
  submitted_by = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);
CREATE POLICY "receipts_insert" ON receipts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND status = 'active')
);
CREATE POLICY "receipts_update" ON receipts FOR UPDATE USING (
  submitted_by = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);
CREATE POLICY "receipts_delete" ON receipts FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);

-- Settlements
CREATE POLICY "settlements_select" ON settlements FOR SELECT USING (true);
CREATE POLICY "settlements_insert" ON settlements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);
CREATE POLICY "settlements_update" ON settlements FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);
CREATE POLICY "settlements_delete" ON settlements FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master')
);

-- Excel Syncs
CREATE POLICY "excel_syncs_all" ON excel_syncs FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('master', 'accountant'))
);
