-- ============================================================
-- 008 - Schema Fixes
-- Fixes mismatches between 001_init.sql and current code
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ----------------------------------------
-- 1. contacts: eksik kolonlar
-- ----------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES contacts(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bank_name text;

-- ----------------------------------------
-- 2. reconciliations: tam yeniden yapılandırma
-- ----------------------------------------

-- title artık nullable
ALTER TABLE reconciliations ALTER COLUMN title DROP NOT NULL;

-- yeni kolonlar ekle
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS reconciliation_number text;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS our_calculated_balance numeric(12,2);
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS our_final_balance numeric(12,2);
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS notification_method text;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS notification_reference text;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- eski GENERATED difference kolonunu kaldır, yeni formülle tekrar ekle
ALTER TABLE reconciliations DROP COLUMN IF EXISTS difference;
ALTER TABLE reconciliations ADD COLUMN difference numeric(12,2)
  GENERATED ALWAYS AS (
    COALESCE(our_final_balance, our_calculated_balance) - COALESCE(their_balance, 0)
  ) STORED;

-- status kısıtını güncelle (eski: open/converted/reconciled → yeni: draft/sent/disputed/agreed/converted/closed)
ALTER TABLE reconciliations DROP CONSTRAINT IF EXISTS reconciliations_status_check;
-- eski değerleri yeni şemaya taşı
UPDATE reconciliations SET status = 'draft'  WHERE status = 'open';
UPDATE reconciliations SET status = 'closed' WHERE status = 'reconciled';
-- yeni kısıt ekle
ALTER TABLE reconciliations ADD CONSTRAINT reconciliations_status_check
  CHECK (status IN ('draft','sent','disputed','agreed','converted','closed'));

-- eski RLS politikası adını koru, yeni politika çakışıyorsa atla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'users see own reconciliations' AND tablename = 'reconciliations'
  ) THEN
    CREATE POLICY "users see own reconciliations" ON reconciliations
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------
-- 3. reconciliation_logs (yeni tablo)
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid REFERENCES reconciliations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  old_status text,
  new_status text,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'users see own logs' AND tablename = 'reconciliation_logs'
  ) THEN
    CREATE POLICY "users see own logs" ON reconciliation_logs
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------
-- 4. generate_reconciliation_number fonksiyonu
-- ----------------------------------------
CREATE OR REPLACE FUNCTION generate_reconciliation_number(p_user_id uuid)
RETURNS text AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_count integer;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM reconciliations
  WHERE user_id = p_user_id AND to_char(created_at, 'YYYY') = v_year;
  RETURN 'MUT-' || v_year || '-' || lpad(v_count::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliations_updated ON reconciliations;
CREATE TRIGGER trg_reconciliations_updated
  BEFORE UPDATE ON reconciliations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------
-- 5. partners (yeni tablo)
-- ----------------------------------------
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'users see own partners' AND tablename = 'partners'
  ) THEN
    CREATE POLICY "users see own partners" ON partners FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------
-- 6. partner_withdrawals (yeni tablo)
-- ----------------------------------------
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'users see own withdrawals' AND tablename = 'partner_withdrawals'
  ) THEN
    CREATE POLICY "users see own withdrawals" ON partner_withdrawals FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------
-- 7. period_closings (yeni tablo)
-- ----------------------------------------
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
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','reopened')),
  notes text,
  closed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_year, period_month)
);

ALTER TABLE period_closings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'users see own period closings' AND tablename = 'period_closings'
  ) THEN
    CREATE POLICY "users see own period closings" ON period_closings FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
