-- Template Marketplace: sellers price their templates, buyers pay
-- through BoDiGi's Stripe, fork unlocks after payment.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_price_cents INTEGER; -- null = free template

-- Purchase ledger — the source of truth for who can fork what
CREATE TABLE IF NOT EXISTS template_purchases (
  id BIGSERIAL PRIMARY KEY,
  template_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  boogi_cut_cents INTEGER NOT NULL DEFAULT 0,     -- platform fee at time of purchase
  seller_earnings_cents INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | paid | refunded
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_purchases_template ON template_purchases(template_project_id);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON template_purchases(buyer_user_id);

ALTER TABLE template_purchases ENABLE ROW LEVEL SECURITY;

-- Buyers see their own purchases; sellers see sales of their templates; admins see all
CREATE POLICY "Buyers view own purchases"
  ON template_purchases FOR SELECT
  USING (
    buyer_user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM projects WHERE projects.id = template_purchases.template_project_id AND projects.user_id = auth.uid())
  );

-- Only the server (service role) inserts/updates purchases — via checkout + webhook
REVOKE INSERT, UPDATE, DELETE ON template_purchases FROM anon, authenticated;
