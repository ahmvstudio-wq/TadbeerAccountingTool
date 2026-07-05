-- ============================================================
-- TADBEER ACCOUNTING — COMPLETE SETUP SQL
-- Run this ONCE in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/wwpjsivzxzgduthowtic/sql/new
-- ============================================================

-- STEP 1: ENUMS
DO $$ BEGIN
  CREATE TYPE nature AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE entry_type AS ENUM ('Dr', 'Cr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE voucher_type AS ENUM (
    'PURCHASE', 'SALE', 'RECEIPT', 'PAYMENT',
    'JOURNAL', 'PURCHASE_RETURN', 'SALES_RETURN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- STEP 2: TABLES
CREATE TABLE IF NOT EXISTS settings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name         TEXT NOT NULL DEFAULT 'My Company',
  base_currency        TEXT NOT NULL DEFAULT 'OMR',
  financial_year_start DATE NOT NULL DEFAULT '2024-04-01',
  address              TEXT,
  phone                TEXT,
  email                TEXT,
  logo_url             TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  parent_id  UUID REFERENCES groups(id) ON DELETE RESTRICT,
  nature     nature NOT NULL,
  is_system  BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledgers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  group_id         UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  opening_balance  NUMERIC(15,2) DEFAULT 0,
  opening_type     entry_type DEFAULT 'Dr',
  is_system        BOOLEAN DEFAULT false,
  description      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vouchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            voucher_type NOT NULL,
  voucher_number  TEXT UNIQUE,
  date            DATE NOT NULL,
  ref             TEXT,
  party_ledger_id UUID REFERENCES ledgers(id),
  party_name      TEXT,
  amount          NUMERIC(15,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'OMR',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  ledger_id  UUID NOT NULL REFERENCES ledgers(id) ON DELETE RESTRICT,
  type       entry_type NOT NULL,
  amount     NUMERIC(15,2) NOT NULL,
  date       DATE NOT NULL,
  narration  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- STEP 3: INDEXES
CREATE INDEX IF NOT EXISTS idx_journal_ledger  ON journal_lines(ledger_id);
CREATE INDEX IF NOT EXISTS idx_journal_date    ON journal_lines(date);
CREATE INDEX IF NOT EXISTS idx_journal_voucher ON journal_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_ledger_group    ON ledgers(group_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date   ON vouchers(date);
CREATE INDEX IF NOT EXISTS idx_vouchers_type   ON vouchers(type);

-- STEP 4: AUTO-UPDATED AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
DROP TRIGGER IF EXISTS trg_groups_updated_at   ON groups;
DROP TRIGGER IF EXISTS trg_ledgers_updated_at  ON ledgers;
DROP TRIGGER IF EXISTS trg_vouchers_updated_at ON vouchers;

CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_groups_updated_at   BEFORE UPDATE ON groups   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ledgers_updated_at  BEFORE UPDATE ON ledgers  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vouchers_updated_at BEFORE UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- STEP 5: DISABLE RLS (so anon key can read/write — suitable for single-user app)
ALTER TABLE settings     DISABLE ROW LEVEL SECURITY;
ALTER TABLE groups       DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledgers      DISABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers     DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines DISABLE ROW LEVEL SECURITY;

-- STEP 6: DEFAULT COMPANY SETTINGS
INSERT INTO settings (company_name, base_currency, financial_year_start)
SELECT 'My Company', 'OMR', '2024-04-01'
WHERE NOT EXISTS (SELECT 1 FROM settings LIMIT 1);

-- STEP 7: ROOT ACCOUNT GROUPS
INSERT INTO groups (id, name, parent_id, nature, is_system, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Assets',      NULL, 'ASSET',     true, 1),
  ('00000000-0000-0000-0000-000000000002', 'Liabilities', NULL, 'LIABILITY', true, 2),
  ('00000000-0000-0000-0000-000000000003', 'Equity',      NULL, 'EQUITY',    true, 3),
  ('00000000-0000-0000-0000-000000000004', 'Income',      NULL, 'INCOME',    true, 4),
  ('00000000-0000-0000-0000-000000000005', 'Expenses',    NULL, 'EXPENSE',   true, 5)
ON CONFLICT (id) DO NOTHING;

-- STEP 8: SUB-GROUPS
INSERT INTO groups (id, name, parent_id, nature, is_system, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001', 'Fixed Assets',            '00000000-0000-0000-0000-000000000001', 'ASSET',     true, 1),
  ('00000000-0000-0000-0001-000000000002', 'Current Assets',          '00000000-0000-0000-0000-000000000001', 'ASSET',     true, 2),
  ('00000000-0000-0000-0001-000000000003', 'Investments',             '00000000-0000-0000-0000-000000000001', 'ASSET',     true, 3),
  ('00000000-0000-0000-0001-000000000004', 'Loans & Advances (Asset)','00000000-0000-0000-0000-000000000001', 'ASSET',     true, 4),
  ('00000000-0000-0000-0002-000000000001', 'Current Liabilities',     '00000000-0000-0000-0000-000000000002', 'LIABILITY', true, 1),
  ('00000000-0000-0000-0002-000000000002', 'Long-Term Liabilities',   '00000000-0000-0000-0000-000000000002', 'LIABILITY', true, 2),
  ('00000000-0000-0000-0002-000000000003', 'Sundry Creditors',        '00000000-0000-0000-0000-000000000002', 'LIABILITY', true, 3),
  ('00000000-0000-0000-0004-000000000001', 'Direct Income',           '00000000-0000-0000-0000-000000000004', 'INCOME',    true, 1),
  ('00000000-0000-0000-0004-000000000002', 'Indirect Income',         '00000000-0000-0000-0000-000000000004', 'INCOME',    true, 2),
  ('00000000-0000-0000-0005-000000000001', 'Cost of Goods Sold',      '00000000-0000-0000-0000-000000000005', 'EXPENSE',   true, 1),
  ('00000000-0000-0000-0005-000000000002', 'Operating Expenses',      '00000000-0000-0000-0000-000000000005', 'EXPENSE',   true, 2),
  ('00000000-0000-0000-0005-000000000003', 'Administrative Exp',      '00000000-0000-0000-0000-000000000005', 'EXPENSE',   true, 3),
  ('00000000-0000-0000-0005-000000000004', 'Financial Charges',       '00000000-0000-0000-0000-000000000005', 'EXPENSE',   true, 4)
ON CONFLICT (id) DO NOTHING;

-- STEP 9: DEFAULT LEDGER ACCOUNTS
INSERT INTO ledgers (id, name, group_id, opening_balance, opening_type, is_system) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Cash in Hand',          '00000000-0000-0000-0001-000000000002', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000002', 'Bank Account',          '00000000-0000-0000-0001-000000000002', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000003', 'Sundry Debtors',        '00000000-0000-0000-0001-000000000002', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000004', 'Stock in Hand',         '00000000-0000-0000-0001-000000000002', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000005', 'Office Equipment',      '00000000-0000-0000-0001-000000000001', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000006', 'Furniture & Fixtures',  '00000000-0000-0000-0001-000000000001', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000007', 'Sundry Creditors',      '00000000-0000-0000-0002-000000000003', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000008', 'VAT Payable',           '00000000-0000-0000-0002-000000000001', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000009', 'Bank Loan',             '00000000-0000-0000-0002-000000000002', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000010', 'Owner Capital',         '00000000-0000-0000-0000-000000000003', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000011', 'Retained Earnings',     '00000000-0000-0000-0000-000000000003', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000012', 'Sales Revenue',         '00000000-0000-0000-0004-000000000001', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000013', 'Service Income',        '00000000-0000-0000-0004-000000000001', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000014', 'Other Income',          '00000000-0000-0000-0004-000000000002', 0, 'Cr', true),
  ('10000000-0000-0000-0000-000000000015', 'Purchases',             '00000000-0000-0000-0005-000000000001', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000016', 'Salaries & Wages',      '00000000-0000-0000-0005-000000000002', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000017', 'Rent Expense',          '00000000-0000-0000-0005-000000000002', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000018', 'Electricity & Utilities','00000000-0000-0000-0005-000000000002',0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000019', 'Office Supplies',       '00000000-0000-0000-0005-000000000003', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000020', 'Bank Charges',          '00000000-0000-0000-0005-000000000004', 0, 'Dr', true),
  ('10000000-0000-0000-0000-000000000021', 'Loan Interest',         '00000000-0000-0000-0005-000000000004', 0, 'Dr', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DONE! Your Tadbeer Accounting database is ready.
-- ============================================================
