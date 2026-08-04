-- ============================================================
-- MIGRATION 013: Fix Sundry Debtors / Creditors structure
-- Problem: system had both a GROUP and a LEDGER with same name
--   "Sundry Debtors"  ledger [id: 10000000-...-0003] → redundant, delete it
--   "Sundry Creditors" ledger [id: 10000000-...-0007] → redundant, delete it
--   "Sundry Creditors" group was under root Liabilities → move to Current Liabilities
--   "Sundry Debtors" had no group → add it as a proper group under Current Assets
-- ============================================================

-- 1. Remove the redundant system ledgers (they have no transactions)
DELETE FROM ledgers WHERE id IN (
  '10000000-0000-0000-0000-000000000003', -- Sundry Debtors (ledger)
  '10000000-0000-0000-0000-000000000007'  -- Sundry Creditors (ledger)
);

-- 2. Ensure "Sundry Debtors" exists as a GROUP under Current Assets
INSERT INTO groups (id, name, parent_id, nature, is_system, sort_order, company_id)
SELECT
  '00000000-0000-0000-0001-000000000005',
  'Sundry Debtors',
  '00000000-0000-0000-0001-000000000002', -- Current Assets
  'ASSET',
  true,
  5,
  id
FROM settings
WHERE NOT EXISTS (
  SELECT 1 FROM groups WHERE id = '00000000-0000-0000-0001-000000000005'
);

-- 3. Move "Sundry Creditors" group to sit under Current Liabilities (not root Liabilities)
UPDATE groups
SET parent_id = '00000000-0000-0000-0002-000000000001'  -- Current Liabilities
WHERE id = '00000000-0000-0000-0002-000000000003'        -- Sundry Creditors group
  AND parent_id = '00000000-0000-0000-0000-000000000002'; -- only if still under root Liabilities
