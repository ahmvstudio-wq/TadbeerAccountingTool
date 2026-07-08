-- ============================================================
-- TADBEER — PHASE 12 VAT MODULE SYSTEM LEDGERS MIGRATION
-- ============================================================

-- 1. Create Duties & Taxes Subgroup under Current Liabilities
INSERT INTO groups (id, name, parent_id, nature, is_system, sort_order, company_id)
VALUES (
  '00000000-0000-0000-0002-000000000004',
  'Duties & Taxes',
  '00000000-0000-0000-0002-000000000001', -- Current Liabilities
  'LIABILITY',
  true,
  4,
  'c0de0000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Create VAT Input and VAT Output system ledgers
INSERT INTO ledgers (id, name, group_id, opening_balance, opening_type, is_system, account_code, classification, company_id)
VALUES (
  '10000000-0000-0000-0000-000000000022',
  'VAT Input',
  '00000000-0000-0000-0002-000000000004', -- Duties & Taxes
  0,
  'Dr',
  true,
  '2004',
  'Personal',
  'c0de0000-0000-0000-0000-000000000000'
),
(
  '10000000-0000-0000-0000-000000000023',
  'VAT Output',
  '00000000-0000-0000-0002-000000000004', -- Duties & Taxes
  0,
  'Cr',
  true,
  '2005',
  'Personal',
  'c0de0000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;
