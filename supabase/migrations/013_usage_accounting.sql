-- Usage accounting: every AI call logged with estimated cost, so the
-- admin dashboard can show revenue vs AI spend vs margin in real time
-- and BoDiGi never silently runs out of usage budget.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id TEXT,
  kind TEXT NOT NULL,             -- build | modify | day2 | loop_wire | interview | setup_agent | support_chat
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  est_cost_cents NUMERIC(10,4) NOT NULL DEFAULT 0,   -- estimated USD cost in cents
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
-- Server-only writes; admins read everything, users read their own
CREATE POLICY "Admins view all usage"
  ON ai_usage_log FOR SELECT
  USING (public.is_admin());
CREATE POLICY "Users view own usage"
  ON ai_usage_log FOR SELECT
  USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON ai_usage_log FROM anon, authenticated;
