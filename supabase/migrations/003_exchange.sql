-- ============================================================
-- ALTER VOUCHERS & CREATE EXCHANGE RATES TABLE
-- Paste and run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wwpjsivzxzgduthowtic/sql/new
-- ============================================================

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency  TEXT NOT NULL,
  to_currency    TEXT NOT NULL,
  rate           NUMERIC(12,6) NOT NULL,
  effective_date DATE NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_currency, to_currency, effective_date)
);

-- Alter vouchers table to add exchange_rate column
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,6) NOT NULL DEFAULT 1.0;

-- Disable RLS for exchange_rates
ALTER TABLE exchange_rates DISABLE ROW LEVEL SECURITY;
