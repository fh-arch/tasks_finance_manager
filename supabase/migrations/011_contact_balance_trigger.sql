-- Auto-update contacts.current_balance whenever current_account_entries changes
CREATE OR REPLACE FUNCTION sync_contact_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id uuid;
  v_balance numeric;
BEGIN
  v_contact_id := COALESCE(NEW.contact_id, OLD.contact_id);
  IF v_contact_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END), 0)
  INTO v_balance
  FROM current_account_entries
  WHERE contact_id = v_contact_id;

  UPDATE contacts SET current_balance = v_balance WHERE id = v_contact_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_contact_balance ON current_account_entries;
CREATE TRIGGER trg_sync_contact_balance
AFTER INSERT OR UPDATE OR DELETE ON current_account_entries
FOR EACH ROW EXECUTE FUNCTION sync_contact_balance();

-- Backfill existing balances
UPDATE contacts c
SET current_balance = COALESCE((
  SELECT SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END)
  FROM current_account_entries
  WHERE contact_id = c.id
), 0);
