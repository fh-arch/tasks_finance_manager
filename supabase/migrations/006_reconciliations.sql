-- Contacts IBAN fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- Mutabakatlar ana tablosu
CREATE TABLE IF NOT EXISTS reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  contact_id uuid REFERENCES contacts(id) NOT NULL,
  reconciliation_number text NOT NULL,
  title text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  our_calculated_balance numeric(12,2),
  our_final_balance numeric(12,2),
  their_balance numeric(12,2),
  notification_method text CHECK (notification_method IN ('pdf','excel','email','phone','manual')),
  notification_reference text,
  difference numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(our_final_balance, our_calculated_balance) - COALESCE(their_balance, 0)
  ) STORED,
  status text CHECK (status IN ('draft','sent','disputed','agreed','converted','closed')) DEFAULT 'draft',
  converted_to text CHECK (converted_to IN ('receivable','payable')),
  converted_id uuid,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid REFERENCES reconciliations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  old_status text,
  new_status text,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "users see own reconciliations" ON reconciliations
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE reconciliation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "users see own logs" ON reconciliation_logs
  FOR ALL USING (auth.uid() = user_id);

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

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliations_updated ON reconciliations;
CREATE TRIGGER trg_reconciliations_updated
  BEFORE UPDATE ON reconciliations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
