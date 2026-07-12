-- ============================================================
-- TADBEER INVENTORY UPGRADE
-- Add opening balance quantity, rate, and value to items
-- ============================================================

-- 1. Create items table if not exists (in case it wasn't created)
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  buy_price NUMERIC(15,3) DEFAULT 0,
  sell_price NUMERIC(15,3) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 5.00,
  stock_quantity NUMERIC(15,3) DEFAULT 0,
  inventory_ledger_id UUID REFERENCES ledgers(id),
  income_ledger_id UUID REFERENCES ledgers(id),
  expense_ledger_id UUID REFERENCES ledgers(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure unique code per company
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_code_company_key;
ALTER TABLE items ADD CONSTRAINT items_code_company_key UNIQUE (code, company_id);
ALTER TABLE items DISABLE ROW LEVEL SECURITY;

-- 2. Add opening balance fields to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS opening_quantity NUMERIC(15,3) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS opening_rate NUMERIC(15,3) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS opening_value NUMERIC(15,3) DEFAULT 0;

-- 3. Trigger or helper to auto-compute opening value (Quantity * Rate) before insert/update
CREATE OR REPLACE FUNCTION compute_item_opening_value()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opening_quantity IS NOT NULL AND NEW.opening_rate IS NOT NULL THEN
    NEW.opening_value := NEW.opening_quantity * NEW.opening_rate;
  ELSE
    NEW.opening_value := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_item_opening_value ON items;
CREATE TRIGGER trg_compute_item_opening_value
BEFORE INSERT OR UPDATE OF opening_quantity, opening_rate ON items
FOR EACH ROW
EXECUTE FUNCTION compute_item_opening_value();
