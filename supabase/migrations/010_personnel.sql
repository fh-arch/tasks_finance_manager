-- Personel tablosu
CREATE TABLE IF NOT EXISTS personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  type text DEFAULT 'employee' CHECK (type IN ('employee', 'freelance')),
  position text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='personnel' AND policyname='Users manage own personnel') THEN
    CREATE POLICY "Users manage own personnel" ON personnel FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Personel ödemeleri tablosu
CREATE TABLE IF NOT EXISTS personnel_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  personnel_id uuid REFERENCES personnel(id) ON DELETE CASCADE,
  payment_type text DEFAULT 'salary' CHECK (payment_type IN ('salary', 'bonus', 'freelance')),
  amount numeric(15,2) NOT NULL,
  payment_date date NOT NULL,
  period_month integer,
  period_year integer,
  description text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE personnel_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='personnel_payments' AND policyname='Users manage own personnel payments') THEN
    CREATE POLICY "Users manage own personnel payments" ON personnel_payments FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
