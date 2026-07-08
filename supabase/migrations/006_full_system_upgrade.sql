-- ============================================================
-- TADBEER ACCOUNTING SYSTEM — FULL SYSTEM UPGRADE MIGRATION
-- ============================================================

-- 1. Create Companies Table
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Create User Companies Map (RBAC)
CREATE TABLE IF NOT EXISTS user_companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('Admin', 'Finance Mgr', 'Accountant', 'Auditor', 'Viewer')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, company_id)
);

-- 3. Seed Default Company and Roles
INSERT INTO companies (id, name)
VALUES ('c0de0000-0000-0000-0000-000000000000', 'Tadbeer Transformations')
ON CONFLICT (id) DO NOTHING;

-- Roles are auto-seeded by the application shell on user's first login.

-- 4. Add company_id columns to existing tables
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Backfill company_id to default company
UPDATE settings SET company_id = 'c0de0000-0000-0000-0000-000000000000' WHERE company_id IS NULL;
UPDATE groups SET company_id = 'c0de0000-0000-0000-0000-000000000000' WHERE company_id IS NULL;
UPDATE ledgers SET company_id = 'c0de0000-0000-0000-0000-000000000000' WHERE company_id IS NULL;
UPDATE vouchers SET company_id = 'c0de0000-0000-0000-0000-000000000000' WHERE company_id IS NULL;
UPDATE journal_lines SET company_id = 'c0de0000-0000-0000-0000-000000000000' WHERE company_id IS NULL;
UPDATE exchange_rates SET company_id = 'c0de0000-0000-0000-0000-000000000000' WHERE company_id IS NULL;

-- 5. Set company_id constraints
ALTER TABLE settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE groups ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE ledgers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE vouchers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE journal_lines ALTER COLUMN company_id SET NOT NULL;

-- Make voucher_number unique PER COMPANY
ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_voucher_number_key;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_voucher_number_company_key UNIQUE (voucher_number, company_id);

-- 6. Add Ledger Fields (Account Code & Classification)
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS classification TEXT CHECK (classification IN ('Personal', 'Real', 'Nominal'));

-- Update existing ledger codes & classifications
-- Assets
UPDATE ledgers SET account_code = '1001', classification = 'Real' WHERE id = '10000000-0000-0000-0000-000000000001'; -- Cash in Hand
UPDATE ledgers SET account_code = '1002', classification = 'Personal' WHERE id = '10000000-0000-0000-0000-000000000002'; -- Bank Account
UPDATE ledgers SET account_code = '1003', classification = 'Personal' WHERE id = '10000000-0000-0000-0000-000000000003'; -- Sundry Debtors
UPDATE ledgers SET account_code = '1004', classification = 'Real' WHERE id = '10000000-0000-0000-0000-000000000004'; -- Stock in Hand
UPDATE ledgers SET account_code = '1005', classification = 'Real' WHERE id = '10000000-0000-0000-0000-000000000005'; -- Office Equipment
UPDATE ledgers SET account_code = '1006', classification = 'Real' WHERE id = '10000000-0000-0000-0000-000000000006'; -- Furniture & Fixtures
-- Liabilities
UPDATE ledgers SET account_code = '2001', classification = 'Personal' WHERE id = '10000000-0000-0000-0000-000000000007'; -- Sundry Creditors
UPDATE ledgers SET account_code = '2002', classification = 'Personal' WHERE id = '10000000-0000-0000-0000-000000000008'; -- VAT Payable
UPDATE ledgers SET account_code = '2003', classification = 'Personal' WHERE id = '10000000-0000-0000-0000-000000000009'; -- Bank Loan
-- Equity
UPDATE ledgers SET account_code = '3001', classification = 'Personal' WHERE id = '10000000-0000-0000-0000-000000000010'; -- Owner Capital
UPDATE ledgers SET account_code = '3002', classification = 'Personal' WHERE id = '10000000-0000-0000-0000-000000000011'; -- Retained Earnings
-- Income
UPDATE ledgers SET account_code = '4001', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000012'; -- Sales Revenue
UPDATE ledgers SET account_code = '4002', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000013'; -- Service Income
UPDATE ledgers SET account_code = '4003', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000014'; -- Other Income
-- Expenses
UPDATE ledgers SET account_code = '5001', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000015'; -- Purchases
UPDATE ledgers SET account_code = '5002', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000016'; -- Salaries & Wages
UPDATE ledgers SET account_code = '5003', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000017'; -- Rent Expense
UPDATE ledgers SET account_code = '5004', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000018'; -- Electricity & Utilities
UPDATE ledgers SET account_code = '5005', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000019'; -- Office Supplies
UPDATE ledgers SET account_code = '5006', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000020'; -- Bank Charges
UPDATE ledgers SET account_code = '5007', classification = 'Nominal' WHERE id = '10000000-0000-0000-0000-000000000021'; -- Loan Interest

-- Default code for other ledgers if any (sequential to avoid unique key duplicates)
WITH numbered_ledgers AS (
  SELECT id, row_number() OVER (ORDER BY name) as rn
  FROM ledgers
  WHERE account_code IS NULL
)
UPDATE ledgers
SET account_code = '9' || lpad(numbered_ledgers.rn::text, 3, '0'),
    classification = 'Nominal'
FROM numbered_ledgers
WHERE ledgers.id = numbered_ledgers.id;
ALTER TABLE ledgers ALTER COLUMN account_code SET NOT NULL;
ALTER TABLE ledgers ALTER COLUMN classification SET NOT NULL;
ALTER TABLE ledgers ADD CONSTRAINT ledgers_account_code_company_key UNIQUE (account_code, company_id);

-- 7. Add Narration to Vouchers
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS narration TEXT;
UPDATE vouchers SET narration = COALESCE(notes, 'General transaction') WHERE narration IS NULL;
ALTER TABLE vouchers ALTER COLUMN narration SET NOT NULL;

-- 8. Create Voucher Deletions Table (Audit Logs)
CREATE TABLE IF NOT EXISTS voucher_deletions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL,
  voucher_number  TEXT NOT NULL,
  deleted_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  deleted_at      TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS for user_companies, companies and voucher_deletions for simple dashboard queries
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_deletions DISABLE ROW LEVEL SECURITY;
