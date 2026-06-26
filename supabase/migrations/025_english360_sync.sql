-- English360 entegrasyonu için alanlar
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS english360_id text unique;
ALTER TABLE personnel_payments ADD COLUMN IF NOT EXISTS english360_payout_id text unique;
ALTER TABLE personnel_payments ADD COLUMN IF NOT EXISTS currency text default 'TRY';
ALTER TABLE personnel_payments ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE personnel_payments ADD COLUMN IF NOT EXISTS payment_date date;
