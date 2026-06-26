-- Add quote tracking columns to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_amount numeric;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_date   date;
