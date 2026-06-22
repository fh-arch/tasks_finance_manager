-- Ortaklar
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  name text NOT NULL,
  share_percent numeric(5,2) DEFAULT 0,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own partners" ON partners FOR ALL USING (auth.uid() = user_id);

-- Ortak Para Çıkışları
CREATE TABLE IF NOT EXISTS partner_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  partner_id uuid REFERENCES partners(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  withdrawal_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  payment_method text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE partner_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own withdrawals" ON partner_withdrawals FOR ALL USING (auth.uid() = user_id);

-- Dönem Kapatmaları
CREATE TABLE IF NOT EXISTS period_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  total_income numeric(12,2) NOT NULL DEFAULT 0,
  total_expense numeric(12,2) NOT NULL DEFAULT 0,
  total_withdrawals numeric(12,2) NOT NULL DEFAULT 0,
  closing_balance numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  notes text,
  closed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_year, period_month)
);

ALTER TABLE period_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own period closings" ON period_closings FOR ALL USING (auth.uid() = user_id);
