-- Revenue ledger: every payment that lands gets its AI reserve carved
-- off the top BEFORE it counts as profit. The reserve funds next
-- month's AI usage; the remainder is what the owner actually earns.

CREATE TABLE IF NOT EXISTS revenue_ledger (
  id BIGSERIAL PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,          -- idempotency: one row per payment
  source TEXT NOT NULL,                   -- subscription | template_sale
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT,
  gross_cents INTEGER NOT NULL,           -- what the customer paid
  ai_reserve_cents INTEGER NOT NULL,      -- carved off for next month's AI budget
  net_profit_cents INTEGER NOT NULL,      -- what's actually yours
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_created ON revenue_ledger(created_at);

ALTER TABLE revenue_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view revenue ledger"
  ON revenue_ledger FOR SELECT
  USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON revenue_ledger FROM anon, authenticated;
