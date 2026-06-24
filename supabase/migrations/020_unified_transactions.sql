-- ═══════════════════════════════════════════════════════════════
-- Phase 1: Unified Transactions Architecture
-- Mevcut tablolar KORUNUR. Yeni type/status değerleri eklenir.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. transactions tablosunu genişlet ──────────────────────────

-- type: receivable / payable / adjustment ekle
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'receivable', 'payable', 'adjustment'));

-- status: open / partial / paid ekle (eski değerler korunur)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('completed', 'pending', 'cancelled', 'open', 'partial', 'paid'));

-- Yeni sütunlar
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date       date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount    numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tx_category    text;         -- serbest form kategori
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS legacy_ref     text UNIQUE;  -- 'receivable:uuid' | 'payable:uuid'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_type    text;         -- customer_subscription vb.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_id      uuid;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_number text;

-- ── 2. payments tablosu ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at        date NOT NULL DEFAULT CURRENT_DATE,
  method         text CHECK (method IN ('cash','bank','card','check','other')),
  note           text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_own" ON payments
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. Receivables → transactions migration ──────────────────────

INSERT INTO transactions (
  id, user_id, contact_id, type, amount, currency, description,
  transaction_date, due_date, status, paid_amount,
  notes, legacy_ref, source_type, source_id, created_at
)
SELECT
  gen_random_uuid(),
  r.user_id,
  r.contact_id,
  'receivable',
  r.amount,
  COALESCE(r.currency, 'TRY'),
  r.description,
  COALESCE(r.issue_date, r.created_at::date),
  r.due_date,
  CASE r.status
    WHEN 'paid'    THEN 'paid'
    WHEN 'partial' THEN 'partial'
    ELSE 'open'
  END,
  COALESCE(r.paid_amount, 0),
  r.notes,
  'receivable:' || r.id::text,
  r.source_type,
  r.source_id,
  r.created_at
FROM receivables r
WHERE NOT EXISTS (
  SELECT 1 FROM transactions t WHERE t.legacy_ref = 'receivable:' || r.id::text
);

-- ── 4. Payables → transactions migration ─────────────────────────

INSERT INTO transactions (
  id, user_id, contact_id, type, amount, currency, description,
  transaction_date, due_date, status, paid_amount,
  notes, legacy_ref, source_type, source_id, created_at
)
SELECT
  gen_random_uuid(),
  p.user_id,
  p.contact_id,
  'payable',
  p.amount,
  COALESCE(p.currency, 'TRY'),
  p.description,
  COALESCE(p.issue_date, p.created_at::date),
  p.due_date,
  CASE p.status
    WHEN 'paid'    THEN 'paid'
    WHEN 'partial' THEN 'partial'
    ELSE 'open'
  END,
  COALESCE(p.paid_amount, 0),
  p.notes,
  'payable:' || p.id::text,
  p.source_type,
  p.source_id,
  p.created_at
FROM payables p
WHERE NOT EXISTS (
  SELECT 1 FROM transactions t WHERE t.legacy_ref = 'payable:' || p.id::text
);

-- ── 5. cash_flow_view ────────────────────────────────────────────

CREATE OR REPLACE VIEW cash_flow_view AS

-- Gerçekleşen: payments tablosundaki kayıtlar
SELECT
  p.paid_at                                                   AS flow_date,
  t.user_id,
  t.contact_id,
  t.type,
  t.description,
  CASE WHEN t.type IN ('income','receivable')
       THEN  p.amount
       ELSE -p.amount END                                     AS flow_amount,
  p.method,
  'realized'                                                  AS flow_type,
  p.id                                                        AS payment_id,
  t.id                                                        AS transaction_id,
  t.tx_category                                               AS category,
  t.legacy_ref
FROM payments p
JOIN transactions t ON t.id = p.transaction_id

UNION ALL

-- Gerçekleşen (eski yol): status='completed' income/expense
SELECT
  t.transaction_date                                          AS flow_date,
  t.user_id,
  t.contact_id,
  t.type,
  t.description,
  CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END AS flow_amount,
  t.payment_method                                            AS method,
  'realized'                                                  AS flow_type,
  NULL                                                        AS payment_id,
  t.id                                                        AS transaction_id,
  t.tx_category                                               AS category,
  NULL                                                        AS legacy_ref
FROM transactions t
WHERE t.status = 'completed'
  AND t.type IN ('income','expense')

UNION ALL

-- Planlanan: open/partial receivable, payable, expense
SELECT
  COALESCE(t.due_date, t.transaction_date)                    AS flow_date,
  t.user_id,
  t.contact_id,
  t.type,
  t.description,
  CASE WHEN t.type IN ('income','receivable')
       THEN  (t.amount - COALESCE(t.paid_amount, 0))
       ELSE -(t.amount - COALESCE(t.paid_amount, 0)) END      AS flow_amount,
  NULL                                                        AS method,
  'planned'                                                   AS flow_type,
  NULL                                                        AS payment_id,
  t.id                                                        AS transaction_id,
  t.tx_category                                               AS category,
  t.legacy_ref
FROM transactions t
WHERE t.status IN ('open','partial','pending')
  AND t.type IN ('receivable','payable','expense','income')
  AND COALESCE(t.due_date, t.transaction_date) IS NOT NULL;

-- ── 6. Contacts: type sütunu ekle (customer/supplier/both/employee) ──

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_type text
  CHECK (contact_type IN ('customer','supplier','both','employee'));

-- Mevcut veriden tahmin: alacağı olan → customer, borcu olan → supplier
UPDATE contacts SET contact_type = 'customer'
WHERE id IN (SELECT DISTINCT contact_id FROM receivables WHERE contact_id IS NOT NULL)
  AND contact_type IS NULL;

UPDATE contacts SET contact_type = 'supplier'
WHERE id IN (SELECT DISTINCT contact_id FROM payables WHERE contact_id IS NOT NULL)
  AND contact_type IS NULL;

UPDATE contacts SET contact_type = 'both'
WHERE id IN (SELECT DISTINCT contact_id FROM receivables WHERE contact_id IS NOT NULL)
  AND id IN (SELECT DISTINCT contact_id FROM payables   WHERE contact_id IS NOT NULL)
  AND contact_type IS NOT NULL;

-- ── 7. Yardımcı: contact bakiye hesaplayan fonksiyon ─────────────

CREATE OR REPLACE FUNCTION contact_balance(p_contact_id uuid, p_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('receivable','income','adjustment') THEN  (amount - COALESCE(paid_amount,0))
      WHEN type IN ('payable','expense')                THEN -(amount - COALESCE(paid_amount,0))
      ELSE 0
    END
  ), 0)
  FROM transactions
  WHERE contact_id = p_contact_id
    AND user_id    = p_user_id
    AND status NOT IN ('paid','cancelled','completed');
$$;

-- ── 8. Index'ler ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_transactions_type        ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_contact     ON transactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_transactions_due_date    ON transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_legacy      ON transactions(legacy_ref);
CREATE INDEX IF NOT EXISTS idx_payments_transaction     ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_user            ON payments(user_id);
