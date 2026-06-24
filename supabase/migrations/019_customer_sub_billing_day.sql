ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS billing_day smallint DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28);
