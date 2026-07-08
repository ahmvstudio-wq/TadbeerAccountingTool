-- ============================================================
-- TADBEER ACCOUNTING TOOL — PHASE 1 MIGRATION
-- ============================================================

-- Add created_by to groups
ALTER TABLE groups 
ADD COLUMN created_by UUID REFERENCES auth.users(id);
