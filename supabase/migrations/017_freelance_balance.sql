ALTER TABLE personnel ADD COLUMN IF NOT EXISTS bakiye numeric(12,2);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS bakiye_tarihi date;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS ara_odeme numeric(12,2);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS ara_odeme_tarihi date;
