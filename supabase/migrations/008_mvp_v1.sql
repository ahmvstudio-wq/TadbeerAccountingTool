-- ============================================================
-- TADBEER MVP V1 MIGRATION
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add contact fields to ledgers
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Oman';
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS address TEXT;

-- 2. Add VAT fields to vouchers
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,3) DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS vat_total NUMERIC(15,3) DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS grand_total NUMERIC(15,3) DEFAULT 0;

-- 3. Voucher sequence table — monotonic counter, never reuse numbers
CREATE TABLE IF NOT EXISTS voucher_sequences (
  type voucher_type PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);

-- Seed initial sequences (get current max from existing vouchers)
INSERT INTO voucher_sequences (type, last_number)
VALUES 
  ('PURCHASE', COALESCE((SELECT COUNT(*) FROM vouchers WHERE type = 'PURCHASE'), 0)),
  ('SALE', COALESCE((SELECT COUNT(*) FROM vouchers WHERE type = 'SALE'), 0)),
  ('RECEIPT', COALESCE((SELECT COUNT(*) FROM vouchers WHERE type = 'RECEIPT'), 0)),
  ('PAYMENT', COALESCE((SELECT COUNT(*) FROM vouchers WHERE type = 'PAYMENT'), 0)),
  ('JOURNAL', COALESCE((SELECT COUNT(*) FROM vouchers WHERE type = 'JOURNAL'), 0))
ON CONFLICT (type) DO NOTHING;

ALTER TABLE voucher_sequences DISABLE ROW LEVEL SECURITY;

-- 4. Ledger sequence table — monotonic counter per nature prefix
CREATE TABLE IF NOT EXISTS ledger_sequences (
  prefix TEXT PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);

-- Seed initial ledger sequences from existing codes
INSERT INTO ledger_sequences (prefix, last_number)
VALUES 
  ('1', COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(account_code, '\D', '', 'g') AS INT)) FROM ledgers WHERE account_code LIKE '1%'), 1999)),
  ('2', COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(account_code, '\D', '', 'g') AS INT)) FROM ledgers WHERE account_code LIKE '2%'), 2999)),
  ('3', COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(account_code, '\D', '', 'g') AS INT)) FROM ledgers WHERE account_code LIKE '3%'), 3999)),
  ('4', COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(account_code, '\D', '', 'g') AS INT)) FROM ledgers WHERE account_code LIKE '4%'), 4999)),
  ('5', COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(account_code, '\D', '', 'g') AS INT)) FROM ledgers WHERE account_code LIKE '5%'), 5999))
ON CONFLICT (prefix) DO NOTHING;

ALTER TABLE ledger_sequences DISABLE ROW LEVEL SECURITY;

-- 5. Create voucher_deletions table if not exists (for audit trail of deleted vouchers)
CREATE TABLE IF NOT EXISTS voucher_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID,
  voucher_number TEXT,
  deleted_by UUID,
  company_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE voucher_deletions DISABLE ROW LEVEL SECURITY;

-- 6. Function to atomically get next voucher number
CREATE OR REPLACE FUNCTION next_voucher_number(p_type voucher_type)
RETURNS INT AS $$
DECLARE
  v_next INT;
BEGIN
  UPDATE voucher_sequences 
  SET last_number = last_number + 1 
  WHERE type = p_type
  RETURNING last_number INTO v_next;
  
  IF v_next IS NULL THEN
    INSERT INTO voucher_sequences (type, last_number) VALUES (p_type, 1)
    RETURNING last_number INTO v_next;
  END IF;
  
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- 7. Function to atomically get next ledger code
CREATE OR REPLACE FUNCTION next_ledger_code(p_prefix TEXT)
RETURNS INT AS $$
DECLARE
  v_next INT;
BEGIN
  UPDATE ledger_sequences 
  SET last_number = last_number + 1 
  WHERE prefix = p_prefix
  RETURNING last_number INTO v_next;
  
  IF v_next IS NULL THEN
    INSERT INTO ledger_sequences (prefix, last_number) VALUES (p_prefix, CAST(p_prefix || '001' AS INT))
    RETURNING last_number INTO v_next;
  END IF;
  
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DONE! Run this in Supabase SQL Editor.
-- ============================================================
