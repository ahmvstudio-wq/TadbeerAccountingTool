-- ============================================================
-- TADBEER ACCOUNTING — LEDGER REAL-TIME BALANCE FUNCTION
-- Run in Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION get_ledger_balance(p_ledger_id UUID)
RETURNS TABLE (
  debit_total NUMERIC(15,3),
  credit_total NUMERIC(15,3),
  current_balance NUMERIC(15,3),
  balance_type TEXT
) AS $$
DECLARE
  v_op_bal NUMERIC(15,3);
  v_op_type TEXT;
  v_nature TEXT;
  v_dr NUMERIC(15,3);
  v_cr NUMERIC(15,3);
  v_net NUMERIC(15,3);
BEGIN
  -- 1. Fetch opening balance details and nature from groups
  SELECT COALESCE(ledgers.opening_balance, 0), ledgers.opening_type, groups.nature
  INTO v_op_bal, v_op_type, v_nature
  FROM ledgers
  JOIN groups ON groups.id = ledgers.group_id
  WHERE ledgers.id = p_ledger_id;

  IF v_op_bal IS NULL THEN
    v_op_bal := 0;
    v_op_type := 'Dr';
  END IF;

  -- 2. Fetch sum of debits and credits from journal lines
  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'Dr'), 0),
         COALESCE(SUM(amount) FILTER (WHERE type = 'Cr'), 0)
  INTO v_dr, v_cr
  FROM journal_lines
  WHERE ledger_id = p_ledger_id;

  -- 3. Calculate net balance based on Nature of group
  IF v_nature = 'ASSET' OR v_nature = 'EXPENSE' THEN
    -- Debit leaning: Dr increases, Cr decreases
    v_net := (CASE WHEN v_op_type = 'Dr' THEN v_op_bal ELSE -v_op_bal END) + v_dr - v_cr;
    v_nature := CASE WHEN v_net >= 0 THEN 'Dr' ELSE 'Cr' END;
  ELSE
    -- Credit leaning: Cr increases, Dr decreases
    v_net := (CASE WHEN v_op_type = 'Cr' THEN v_op_bal ELSE -v_op_bal END) + v_cr - v_dr;
    v_nature := CASE WHEN v_net >= 0 THEN 'Cr' ELSE 'Dr' END;
  END IF;

  RETURN QUERY SELECT v_dr, v_cr, ABS(v_net), v_nature;
END;
$$ LANGUAGE plpgsql;
