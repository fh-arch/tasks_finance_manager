ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours numeric(6,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours numeric(6,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
