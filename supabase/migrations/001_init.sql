-- Lattice Finance — Full Schema Migration

-- profiles
create table if not exists profiles (
  id uuid references auth.users primary key,
  full_name text,
  company_name text,
  currency text default 'TRY',
  created_at timestamptz default now()
);

-- categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  type text check (type in ('income','expense')),
  color text
);

-- contacts (Cari Hesaplar)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text check (type in ('customer','supplier','both')) default 'customer',
  name text not null,
  tax_number text,
  tax_office text,
  email text,
  phone text,
  address text,
  city text,
  notes text,
  credit_limit numeric(12,2),
  current_balance numeric(12,2) default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- current_account_entries (Cari Hareketler)
create table if not exists current_account_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  entry_type text check (entry_type in ('debit','credit')),
  amount numeric(12,2) not null,
  description text,
  entry_date date default current_date,
  related_type text,
  related_id uuid,
  created_at timestamptz default now()
);

-- transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id),
  category_id uuid references categories(id),
  type text check (type in ('income','expense')),
  amount numeric(12,2) not null,
  currency text default 'TRY',
  description text,
  transaction_date date not null,
  payment_method text,
  status text check (status in ('completed','pending','cancelled')) default 'completed',
  notes text,
  created_at timestamptz default now()
);

-- subscriptions (Gider Abonelikleri)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  category_id uuid references categories(id),
  name text not null,
  amount numeric(12,2) not null,
  currency text default 'TRY',
  billing_cycle text check (billing_cycle in ('monthly','quarterly','yearly')),
  next_billing_date date not null,
  start_date date,
  end_date date,
  status text check (status in ('active','paused','cancelled')) default 'active',
  auto_renew boolean default true,
  notes text,
  created_at timestamptz default now()
);

-- customer_subscriptions (Müşteri Abonelikleri)
create table if not exists customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id) not null,
  plan_name text not null,
  amount numeric(12,2) not null,
  currency text default 'TRY',
  billing_cycle text check (billing_cycle in ('monthly','quarterly','yearly')),
  start_date date not null,
  end_date date,
  next_billing_date date not null,
  status text check (status in ('active','paused','cancelled','trial')) default 'active',
  auto_create_receivable boolean default true,
  notes text,
  created_at timestamptz default now()
);

-- receivables (Alacaklar)
create table if not exists receivables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id),
  category_id uuid references categories(id),
  amount numeric(12,2) not null,
  currency text default 'TRY',
  due_date date,
  issue_date date default current_date,
  description text,
  status text check (status in ('pending','partial','paid','overdue','disputed')) default 'pending',
  paid_amount numeric(12,2) default 0,
  invoice_number text,
  source_type text,
  source_id uuid,
  notes text,
  created_at timestamptz default now()
);

-- payables (Borçlar)
create table if not exists payables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id),
  category_id uuid references categories(id),
  amount numeric(12,2) not null,
  currency text default 'TRY',
  due_date date,
  issue_date date default current_date,
  description text,
  status text check (status in ('pending','partial','paid','overdue')) default 'pending',
  paid_amount numeric(12,2) default 0,
  source_type text,
  source_id uuid,
  notes text,
  created_at timestamptz default now()
);

-- reconciliations (Mutabakatlar)
create table if not exists reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id),
  title text not null,
  period_start date,
  period_end date,
  our_balance numeric(12,2),
  their_balance numeric(12,2),
  difference numeric(12,2) generated always as (our_balance - their_balance) stored,
  status text check (status in ('open','converted','reconciled')) default 'open',
  converted_to text,
  converted_id uuid,
  notes text,
  created_at timestamptz default now()
);

-- quotes (Teklifler)
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id),
  quote_number text not null,
  title text not null,
  issue_date date default current_date,
  valid_until date,
  status text check (status in ('draft','sent','accepted','rejected','expired')) default 'draft',
  subtotal numeric(12,2),
  tax_rate numeric(5,2) default 20,
  tax_amount numeric(12,2),
  total numeric(12,2),
  currency text default 'TRY',
  notes text,
  converted_to_receivable boolean default false,
  receivable_id uuid references receivables(id),
  created_at timestamptz default now()
);

-- quote_items (Teklif Kalemleri)
create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) default 1,
  unit_price numeric(12,2) not null,
  discount_percent numeric(5,2) default 0,
  line_total numeric(12,2),
  sort_order integer default 0
);

-- documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  related_type text,
  related_id uuid,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size integer,
  uploaded_at timestamptz default now()
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

alter table profiles enable row level security;
create policy "users own profile" on profiles for all using (auth.uid() = id);

alter table categories enable row level security;
create policy "users own categories" on categories for all using (auth.uid() = user_id);

alter table contacts enable row level security;
create policy "users own contacts" on contacts for all using (auth.uid() = user_id);

alter table current_account_entries enable row level security;
create policy "users own entries" on current_account_entries for all using (auth.uid() = user_id);

alter table transactions enable row level security;
create policy "users own transactions" on transactions for all using (auth.uid() = user_id);

alter table subscriptions enable row level security;
create policy "users own subscriptions" on subscriptions for all using (auth.uid() = user_id);

alter table customer_subscriptions enable row level security;
create policy "users own customer_subscriptions" on customer_subscriptions for all using (auth.uid() = user_id);

alter table receivables enable row level security;
create policy "users own receivables" on receivables for all using (auth.uid() = user_id);

alter table payables enable row level security;
create policy "users own payables" on payables for all using (auth.uid() = user_id);

alter table reconciliations enable row level security;
create policy "users own reconciliations" on reconciliations for all using (auth.uid() = user_id);

alter table quotes enable row level security;
create policy "users own quotes" on quotes for all using (auth.uid() = user_id);

alter table quote_items enable row level security;
create policy "users own quote_items" on quote_items for all
  using (exists (select 1 from quotes where quotes.id = quote_items.quote_id and quotes.user_id = auth.uid()));

alter table documents enable row level security;
create policy "users own documents" on documents for all using (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: Update contacts.current_balance
-- ============================================================
create or replace function update_contact_balance()
returns trigger language plpgsql as $$
begin
  update contacts set current_balance = (
    select coalesce(sum(case when entry_type = 'debit' then amount else -amount end), 0)
    from current_account_entries
    where contact_id = coalesce(new.contact_id, old.contact_id)
  )
  where id = coalesce(new.contact_id, old.contact_id);
  return coalesce(new, old);
end;
$$;

create trigger trg_update_contact_balance
after insert or update or delete on current_account_entries
for each row execute function update_contact_balance();

-- ============================================================
-- Storage bucket (run manually in Supabase Dashboard > Storage)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('finans-bucket', 'finans-bucket', false);
-- create policy "user owns folder" on storage.objects for all
--   using (auth.uid()::text = (storage.foldername(name))[1]);
