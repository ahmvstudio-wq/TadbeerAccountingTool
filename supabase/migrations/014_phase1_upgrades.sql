-- ============================================================
-- MIGRATION 014: Phase 1 Upgrades
-- Adds: quantity, rate, supplier_invoice_ref, settlement support
-- ============================================================

-- 1. Add quantity and rate to voucher type (for Sales/Purchase line items)
-- The app currently stores line items captured in-memory but not in DB.
-- We need a voucher_lines table for proper persistence and settlement tracking.

CREATE TABLE IF NOT EXISTS voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  ledger_id UUID NOT NULL REFERENCES ledgers(id),
  description TEXT,
  quantity NUMERIC(15,3) DEFAULT 1,
  rate NUMERIC(15,6) DEFAULT 0,
  amount NUMERIC(15,3) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 0,
  vat_amount NUMERIC(15,3) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
ALTER TABLE voucher_lines DISABLE ROW LEVEL SECURITY;

-- 2. Add supplier_invoice_ref to vouchers
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS supplier_invoice_ref TEXT;

-- 3. Ensure voucher amount columns are NUMERIC(15,3) for OMR precision
-- (already NUMERIC(15,3) from migration 008 for subtotal/vat_total/grand_total)
-- Fix the base amount column if still NUMERIC(15,2)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'amount'
    AND numeric_precision = 15 AND numeric_scale = 2
  ) THEN
    ALTER TABLE vouchers ALTER COLUMN amount TYPE NUMERIC(15,3);
  END IF;
END $$;

-- Fix journal_lines amount precision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_lines' AND column_name = 'amount'
    AND numeric_precision = 15 AND numeric_scale = 2
  ) THEN
    ALTER TABLE journal_lines ALTER COLUMN amount TYPE NUMERIC(15,3);
  END IF;
END $$;

-- Fix ledgers opening_balance precision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledgers' AND column_name = 'opening_balance'
    AND numeric_precision = 15 AND numeric_scale = 2
  ) THEN
    ALTER TABLE ledgers ALTER COLUMN opening_balance TYPE NUMERIC(15,3);
  END IF;
END $$;

-- 4. Create settlements table for invoice allocation tracking
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- The voucher making the receipt/payment
  source_voucher_id UUID NOT NULL REFERENCES vouchers(id),
  source_voucher_number TEXT NOT NULL,
  source_type voucher_type NOT NULL,  -- RECEIPT or PAYMENT
  
  -- The invoice being settled (can be NULL for on-account)
  target_voucher_id UUID REFERENCES vouchers(id),
  target_voucher_number TEXT,
  target_type voucher_type,  -- SALE or PURCHASE
  
  -- Party
  party_ledger_id UUID NOT NULL REFERENCES ledgers(id),
  party_name TEXT,
  
  -- Allocation details
  allocated_amount NUMERIC(15,3) NOT NULL DEFAULT 0,
  is_on_account BOOLEAN DEFAULT false,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_settlements_source ON settlements(source_voucher_id);
CREATE INDEX IF NOT EXISTS idx_settlements_target ON settlements(target_voucher_id);
CREATE INDEX IF NOT EXISTS idx_settlements_party ON settlements(party_ledger_id);
ALTER TABLE settlements DISABLE ROW LEVEL SECURITY;

-- 5. Backfill voucher_lines from existing vouchers that have no lines
-- For existing vouchers, create voucher_lines from their journal lines
-- (This is a one-time migration for existing data)
