-- ============================================================
-- MIGRATION 015: Disable RLS on core transactional tables
-- 
-- Root cause of multi-line voucher posting failure:
-- journal_lines, vouchers, ledgers, and groups had RLS enabled
-- but the app uses the anon key (no auth.uid() context).
-- Bulk inserts of 3+ journal lines were being silently blocked
-- by Supabase RLS with no permissive policy in place.
--
-- Since Tadbeer is a single-company app using the anon key
-- for all DB operations, we disable RLS on all core tables.
-- ============================================================

ALTER TABLE journal_lines    DISABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers         DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledgers          DISABLE ROW LEVEL SECURITY;
ALTER TABLE groups           DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings         DISABLE ROW LEVEL SECURITY;

-- Also drop any existing restrictive RLS policies on these tables
-- to prevent partial-block even when RLS is off (safety net):
DROP POLICY IF EXISTS "Enable read access for all users" ON journal_lines;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON journal_lines;
DROP POLICY IF EXISTS "Enable read access for all users" ON vouchers;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON vouchers;
DROP POLICY IF EXISTS "Enable read access for all users" ON ledgers;
DROP POLICY IF EXISTS "Enable read access for all users" ON groups;
DROP POLICY IF EXISTS "Enable read access for all users" ON settings;
