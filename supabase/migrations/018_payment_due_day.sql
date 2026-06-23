ALTER TABLE personnel ADD COLUMN IF NOT EXISTS son_odeme_gunu smallint CHECK (son_odeme_gunu BETWEEN 1 AND 31);
