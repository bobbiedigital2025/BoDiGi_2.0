-- 019_loop_leads.sql — Engagement loop v2: the Honest Verdict front door
-- (bodigi2.com/loop.html). Every idea submitted lands here.
-- The idea text is the sales trigger — quote it back in follow-ups.

CREATE TABLE IF NOT EXISTS loop_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  idea_text TEXT NOT NULL,
  verdict JSONB,                    -- {market:{verdict,score}, money:{...}, execution:{...}, pivot, first_move}
  source TEXT NOT NULL DEFAULT 'loop',
  ref_code TEXT UNIQUE,             -- this lead's own invite code (invite-3 tracking)
  referred_by TEXT,                 -- ref code of whoever invited them
  converted BOOLEAN NOT NULL DEFAULT FALSE,  -- flipped when they create a bodigi2.com account
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same email + same idea = cached verdict returned, no AI re-burn.
-- A refined idea (different text) gets a fresh verdict ("second shot").
CREATE UNIQUE INDEX IF NOT EXISTS idx_loop_leads_email_idea ON loop_leads(email, idea_text);

CREATE INDEX IF NOT EXISTS idx_loop_leads_created ON loop_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loop_leads_referred_by ON loop_leads(referred_by);

ALTER TABLE loop_leads ENABLE ROW LEVEL SECURITY;

-- Public inserts go through /api/loop/lead (service role only). No anon policies.
CREATE POLICY "Admins view loop leads"
  ON loop_leads FOR SELECT
  USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON loop_leads FROM anon, authenticated;
