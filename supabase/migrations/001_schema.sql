-- ============================================================
-- TADBEER ACCOUNTING TOOL — DATABASE SCHEMA
-- ============================================================

-- ENUMS
CREATE TYPE nature AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');
CREATE TYPE entry_type AS ENUM ('Dr', 'Cr');
CREATE TYPE voucher_type AS ENUM (
  'PURCHASE',
  'SALE',
  'RECEIPT',
  'PAYMENT',
  'JOURNAL',
  'PURCHASE_RETURN',
  'SALES_RETURN'
);

-- ============================================================
-- COMPANY SETTINGS
-- ============================================================
CREATE TABLE settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT NOT NULL DEFAULT 'My Company',
  base_currency   TEXT NOT NULL DEFAULT 'OMR',
  financial_year_start DATE NOT NULL DEFAULT '2024-04-01',
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  logo_url        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ACCOUNT GROUPS (Chart of Accounts — top level + sub-groups)
-- ============================================================
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES groups(id) ON DELETE RESTRICT,
  nature      nature NOT NULL,
  is_system   BOOLEAN DEFAULT false,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- LEDGERS (individual accounts under groups)
-- ============================================================
CREATE TABLE ledgers (
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

-- ============================================================
-- VOUCHERS (user-facing transactions)
-- ============================================================
CREATE TABLE vouchers (
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

-- ============================================================
-- JOURNAL LINES (auto-generated double-entry records)
-- ============================================================
CREATE TABLE journal_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id  UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  ledger_id   UUID NOT NULL REFERENCES ledgers(id) ON DELETE RESTRICT,
  type        entry_type NOT NULL,
  amount      NUMERIC(15,2) NOT NULL,
  date        DATE NOT NULL,
  narration   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES (report performance)
-- ============================================================
CREATE INDEX idx_journal_ledger     ON journal_lines(ledger_id);
CREATE INDEX idx_journal_date       ON journal_lines(date);
CREATE INDEX idx_journal_type       ON journal_lines(type);
CREATE INDEX idx_journal_voucher    ON journal_lines(voucher_id);
CREATE INDEX idx_ledger_group       ON ledgers(group_id);
CREATE INDEX idx_groups_parent      ON groups(parent_id);
CREATE INDEX idx_vouchers_date      ON vouchers(date);
CREATE INDEX idx_vouchers_type      ON vouchers(type);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_settings_updated_at   BEFORE UPDATE ON settings   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_groups_updated_at     BEFORE UPDATE ON groups     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ledgers_updated_at    BEFORE UPDATE ON ledgers    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vouchers_updated_at   BEFORE UPDATE ON vouchers   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
