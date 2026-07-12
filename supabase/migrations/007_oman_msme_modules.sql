-- ============================================================
-- TADBEER ACCOUNTING SYSTEM — INVENTORY & INVOICING UPGRADE
-- ============================================================

-- 1. Create Items Table
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
ALTER TABLE items ADD CONSTRAINT items_code_company_key UNIQUE (code, company_id);
ALTER TABLE items DISABLE ROW LEVEL SECURITY;

-- 2. Create Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type voucher_type NOT NULL, -- PURCHASE or SALE
  invoice_number TEXT NOT NULL,
  date DATE NOT NULL,
  due_date DATE,
  party_ledger_id UUID NOT NULL REFERENCES ledgers(id),
  party_name TEXT NOT NULL,
  subtotal NUMERIC(15,3) NOT NULL,
  tax_total NUMERIC(15,3) NOT NULL,
  grand_total NUMERIC(15,3) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'OMR',
  exchange_rate NUMERIC(15,6) DEFAULT 1,
  notes TEXT,
  status TEXT DEFAULT 'DRAFT', -- DRAFT, POSTED, CANCELLED
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE invoices ADD CONSTRAINT invoices_number_company_key UNIQUE (invoice_number, company_id);
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;

-- 3. Create Invoice Lines Table
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity NUMERIC(15,3) NOT NULL,
  unit_price NUMERIC(15,3) NOT NULL,
  discount NUMERIC(15,3) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(15,3) NOT NULL,
  line_total NUMERIC(15,3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE invoice_lines DISABLE ROW LEVEL SECURITY;
