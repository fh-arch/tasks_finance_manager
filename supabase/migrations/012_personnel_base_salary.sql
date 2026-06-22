ALTER TABLE personnel ADD COLUMN IF NOT EXISTS base_salary numeric(15,2) DEFAULT 0;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS base_bonus numeric(15,2) DEFAULT 0;
