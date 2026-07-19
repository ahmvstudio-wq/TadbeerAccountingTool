-- ============================================================
-- TADBEER: CLEAN TRANSACTION DATA
-- Deletes: vouchers, journal_lines, voucher_lines, settlements,
--          invoices, invoice_lines, voucher_deletions
-- Keeps:   items, ledgers, groups, settings, companies,
--          exchange_rates, ledger_sequences
-- Also resets voucher number sequences back to 0
-- ============================================================
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

BEGIN;

-- 1. Delete settlements (references vouchers)
DELETE FROM settlements;

-- 2. Delete voucher_lines (references vouchers)
DELETE FROM voucher_lines;

-- 3. Delete journal_lines (references vouchers)
DELETE FROM journal_lines;

-- 4. Delete voucher deletion audit log
DELETE FROM voucher_deletions;

-- 5. Delete all vouchers (Sales, Purchase, Payment, Receipt, Journal)
DELETE FROM vouchers;

-- 6. Delete invoice lines (references invoices)
DELETE FROM invoice_lines;

-- 7. Delete invoices
DELETE FROM invoices;

-- 8. Reset voucher number sequences back to 0
--    (so next voucher starts from INV-001, PV-001, etc.)
UPDATE voucher_sequences SET last_number = 0;

COMMIT;

-- Verify cleanup:
SELECT 'vouchers'      AS table_name, COUNT(*) AS remaining FROM vouchers
UNION ALL
SELECT 'journal_lines' AS table_name, COUNT(*) AS remaining FROM journal_lines
UNION ALL
SELECT 'voucher_lines' AS table_name, COUNT(*) AS remaining FROM voucher_lines
UNION ALL
SELECT 'settlements'   AS table_name, COUNT(*) AS remaining FROM settlements
UNION ALL
SELECT 'invoices'      AS table_name, COUNT(*) AS remaining FROM invoices
UNION ALL
SELECT 'items'         AS table_name, COUNT(*) AS remaining FROM items
UNION ALL
SELECT 'ledgers'       AS table_name, COUNT(*) AS remaining FROM ledgers;
