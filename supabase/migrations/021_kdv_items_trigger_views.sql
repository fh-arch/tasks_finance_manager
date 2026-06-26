-- ═══════════════════════════════════════════════════════════
-- Sprint 1 Remaining: KDV, transaction_items, trigger, views
-- ═══════════════════════════════════════════════════════════

-- ── 1. transactions: eksik kolonlar ─────────────────────────

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS kdv_rate     numeric(5,2)  DEFAULT 0  NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product      text;         -- FormLand | Eddy | English360 | NovaCRM ...
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS period_end   date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_no text;         -- fatura/referans no
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at   timestamptz   DEFAULT now();

-- KDV hesaplanan kolonlar (stored GENERATED)
-- Önce varsa drop et, yeniden oluştur
ALTER TABLE transactions DROP COLUMN IF EXISTS kdv_amount;
ALTER TABLE transactions DROP COLUMN IF EXISTS total_amount;

ALTER TABLE transactions ADD COLUMN kdv_amount numeric(12,2)
  GENERATED ALWAYS AS (ROUND(amount * kdv_rate / 100, 2)) STORED;

ALTER TABLE transactions ADD COLUMN total_amount numeric(12,2)
  GENERATED ALWAYS AS (ROUND(amount + amount * kdv_rate / 100, 2)) STORED;

-- updated_at otomatik güncellemesi
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_transactions ON transactions;
CREATE TRIGGER trg_touch_transactions
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 2. transaction_items tablosu ────────────────────────────

CREATE TABLE IF NOT EXISTS transaction_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  label          text NOT NULL,        -- şube adı / öğrenci adı / kalem
  sub_label      text,                 -- şehir / sınıf / açıklama
  unit_price     numeric(12,2) NOT NULL DEFAULT 0,
  kdv_rate       numeric(5,2)  NOT NULL DEFAULT 0,
  quantity       numeric(10,2) NOT NULL DEFAULT 1,
  total          numeric(12,2) GENERATED ALWAYS AS
                   (ROUND(unit_price * quantity * (1 + kdv_rate/100), 2)) STORED,
  sort_order     int DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_own" ON transaction_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tx_items_transaction ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_items_user        ON transaction_items(user_id);

-- ── 3. reconciliations tablosunu yeni şemaya genişlet ───────

ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS transaction_id  uuid REFERENCES transactions(id);
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS reference_no    text UNIQUE;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS sent_at         timestamptz;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS response_deadline date;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS response_at     timestamptz;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS response_note   text;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS created_by      text;

-- Eski status değerlerini yeni şemaya map et
ALTER TABLE reconciliations DROP CONSTRAINT IF EXISTS reconciliations_status_check;
ALTER TABLE reconciliations ADD CONSTRAINT reconciliations_status_check
  CHECK (status IN ('draft','sent','confirmed','disputed','expired','open','converted','reconciled'));

-- Referans no otomatik oluşturan fonksiyon
CREATE OR REPLACE FUNCTION generate_reconciliation_ref(p_user_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_year  int := EXTRACT(YEAR FROM now());
  v_seq   int;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(reference_no, '-', 3) AS int)), 0) + 1
  INTO v_seq
  FROM reconciliations
  WHERE user_id = p_user_id AND reference_no LIKE 'MUT-' || v_year || '-%';

  RETURN 'MUT-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$$;

-- ── 4. Status Update Trigger (payments → transaction.status) ─

CREATE OR REPLACE FUNCTION update_transaction_status_from_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_paid  numeric;
  v_total_amount numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments
  WHERE transaction_id = COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT COALESCE(total_amount, amount) INTO v_total_amount
  FROM transactions
  WHERE id = COALESCE(NEW.transaction_id, OLD.transaction_id);

  UPDATE transactions SET
    paid_amount = v_total_paid,
    status = CASE
      WHEN v_total_paid <= 0           THEN 'open'
      WHEN v_total_paid >= v_total_amount THEN 'paid'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = COALESCE(NEW.transaction_id, OLD.transaction_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_status ON payments;
CREATE TRIGGER trg_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_transaction_status_from_payment();

-- ── 5. current_account_view ─────────────────────────────────

CREATE OR REPLACE VIEW current_account_view AS
SELECT
  c.id   AS contact_id,
  c.name,
  c.type,
  COALESCE(SUM(CASE WHEN t.type = 'receivable' THEN t.total_amount ELSE 0 END), 0) AS toplam_alacak,
  COALESCE(SUM(CASE WHEN t.type = 'payable'    THEN t.total_amount ELSE 0 END), 0) AS toplam_borc,
  COALESCE(SUM(CASE WHEN t.type = 'receivable' THEN COALESCE(p.odenen, 0) ELSE 0 END), 0) AS tahsil_edilen,
  COALESCE(SUM(CASE WHEN t.type = 'payable'    THEN COALESCE(p.odenen, 0) ELSE 0 END), 0) AS odenen,
  COALESCE(SUM(
    CASE
      WHEN t.type = 'receivable'  THEN  (t.total_amount - COALESCE(p.odenen, 0))
      WHEN t.type = 'payable'     THEN -(t.total_amount - COALESCE(p.odened, 0))
      WHEN t.type = 'adjustment'  THEN  t.amount
      ELSE 0
    END
  ), 0) AS net_bakiye
FROM contacts c
LEFT JOIN transactions t
  ON t.contact_id = c.id AND t.status != 'cancelled'
LEFT JOIN (
  SELECT transaction_id, SUM(amount) AS odenen
  FROM payments GROUP BY transaction_id
) p ON p.transaction_id = t.id
GROUP BY c.id, c.name, c.type;

-- ── 6. Nakit Akışı VIEW güncelle (product + contact dahil) ──

CREATE OR REPLACE VIEW cash_flow_view AS
SELECT
  p.paid_at                                    AS flow_date,
  t.user_id,
  t.contact_id,
  c.name                                       AS contact_name,
  t.type,
  t.category                                   AS category,
  t.tx_category,
  t.product,
  t.description,
  CASE WHEN t.type IN ('income','receivable')
       THEN  p.amount
       ELSE -p.amount END                      AS flow_amount,
  p.method,
  'realized'                                   AS flow_type,
  p.id                                         AS payment_id,
  t.id                                         AS transaction_id,
  t.legacy_ref
FROM payments p
JOIN transactions t ON t.id = p.transaction_id
LEFT JOIN contacts c ON c.id = t.contact_id

UNION ALL

SELECT
  t.transaction_date                           AS flow_date,
  t.user_id,
  t.contact_id,
  c.name                                       AS contact_name,
  t.type,
  t.category,
  t.tx_category,
  t.product,
  t.description,
  CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END AS flow_amount,
  t.payment_method                             AS method,
  'realized'                                   AS flow_type,
  NULL                                         AS payment_id,
  t.id                                         AS transaction_id,
  NULL                                         AS legacy_ref
FROM transactions t
LEFT JOIN contacts c ON c.id = t.contact_id
WHERE t.status = 'completed' AND t.type IN ('income','expense')

UNION ALL

SELECT
  COALESCE(t.due_date, t.transaction_date)    AS flow_date,
  t.user_id,
  t.contact_id,
  c.name                                       AS contact_name,
  t.type,
  t.category,
  t.tx_category,
  t.product,
  t.description,
  CASE WHEN t.type IN ('income','receivable')
       THEN  (t.total_amount - COALESCE(t.paid_amount, 0))
       ELSE -(t.total_amount - COALESCE(t.paid_amount, 0)) END AS flow_amount,
  NULL                                         AS method,
  'planned'                                    AS flow_type,
  NULL                                         AS payment_id,
  t.id                                         AS transaction_id,
  t.legacy_ref
FROM transactions t
LEFT JOIN contacts c ON c.id = t.contact_id
WHERE t.status IN ('open','partial','pending')
  AND t.type IN ('receivable','payable','expense','income')
  AND COALESCE(t.due_date, t.transaction_date) IS NOT NULL;

-- ── 7. Expired reconciliation'ları otomatik kapat ───────────

CREATE OR REPLACE FUNCTION expire_reconciliations()
RETURNS void LANGUAGE sql AS $$
  UPDATE reconciliations
  SET status = 'expired'
  WHERE status = 'sent'
    AND response_deadline < CURRENT_DATE
    AND response_at IS NULL;
$$;
