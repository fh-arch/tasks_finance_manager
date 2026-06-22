-- Para girişi / çıkışı ayrımı için movement_type kolonu
ALTER TABLE partner_withdrawals ADD COLUMN IF NOT EXISTS movement_type text DEFAULT 'expense' CHECK (movement_type IN ('income', 'expense'));

-- Profil: logo ve şirket bilgileri
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_tax_no text;

-- Mutabakat içe aktarılan liste satırları (karşı taraf ekstresi)
CREATE TABLE IF NOT EXISTS reconciliation_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid REFERENCES reconciliations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  row_date date,
  description text,
  amount numeric(15,2) DEFAULT 0,
  entry_type text DEFAULT 'debit' CHECK (entry_type IN ('debit', 'credit')),
  source text DEFAULT 'excel',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_import_rows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reconciliation_import_rows' AND policyname = 'Users manage own reconciliation import rows') THEN
    CREATE POLICY "Users manage own reconciliation import rows" ON reconciliation_import_rows FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Storage bucket: şirket logosu
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-logos', 'company-logos', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'company-logos public read') THEN
    CREATE POLICY "company-logos public read" ON storage.objects FOR SELECT USING (bucket_id = 'company-logos');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'company-logos auth insert') THEN
    CREATE POLICY "company-logos auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-logos');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'company-logos auth update') THEN
    CREATE POLICY "company-logos auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'company-logos');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'company-logos auth delete') THEN
    CREATE POLICY "company-logos auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'company-logos');
  END IF;
END $$;
