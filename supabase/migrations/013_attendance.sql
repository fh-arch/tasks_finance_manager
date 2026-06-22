ALTER TABLE personnel ADD COLUMN IF NOT EXISTS hire_date date;

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  personnel_id uuid REFERENCES personnel(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  status text DEFAULT 'present' CHECK (status IN ('present', 'sick', 'absent', 'leave', 'weekend')),
  entry_time text DEFAULT '09:00',
  break_start text DEFAULT '12:00',
  break_end text DEFAULT '13:00',
  exit_time text DEFAULT '18:00',
  hours numeric(4,1) DEFAULT 8,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(personnel_id, record_date)
);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attendance_records' AND policyname='Users manage own attendance') THEN
    CREATE POLICY "Users manage own attendance" ON attendance_records FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
