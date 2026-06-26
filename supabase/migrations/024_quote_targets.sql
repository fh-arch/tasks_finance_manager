-- Teklif hedefleri tablosu
CREATE TABLE IF NOT EXISTS quote_targets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  period_type text check (period_type in ('monthly','quarterly','yearly')) not null,
  period_year integer not null,
  period_num  integer not null, -- ay için 1-12, çeyrek için 1-4, yıllık için 1
  amount_target  numeric(14,2) default 0,  -- teklif tutarı hedefi
  count_target   integer default 0,         -- teklif adedi hedefi
  created_at  timestamptz default now(),
  unique (user_id, period_type, period_year, period_num)
);

ALTER TABLE quote_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own targets" ON quote_targets FOR ALL USING (auth.uid() = user_id);
