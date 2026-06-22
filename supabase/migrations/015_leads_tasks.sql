-- Müşteri Adayları (CRM Leads)
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  full_name text NOT NULL,
  company text,
  email text,
  phone text,
  city text,
  status text DEFAULT 'gorusuldu' CHECK (status IN ('gorusuldu', 'teklif_verildi', 'kazanildi', 'kaybedildi')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_user_policy ON leads;
CREATE POLICY leads_user_policy ON leads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Görevler (Tasks)
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date date,
  assigned_to_personnel_id uuid REFERENCES personnel(id) ON DELETE SET NULL,
  assigned_to_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_user_policy ON tasks;
CREATE POLICY tasks_user_policy ON tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
