-- ============================================================================
-- 021 — AD CAMPAIGNS (Ad Studio v2 pre-purchase scripting layer; render_jobs = 020, applied)
-- One campaign = one master script + 3 hook variants, cut to 6 videos
-- (3 hooks × 2 formats), plus per-platform posting copy + a day-by-day
-- posting plan. Delivered as a package — "testing" is a playbook we hand
-- the customer, never a fake automation claim (loop true-up rule).
--
-- Lifecycle: draft → scripted → rendering → cutting → delivered
--            (+ failed side state)
--   draft    — row created, brief captured, script not yet generated
--   scripted — AI wrote master + 3 hook variants + copy + plan
--   rendering— master kinetic render in flight (avatar tier: HeyGen master)
--   cutting  — ffmpeg pass producing the 6 cuts
--   delivered— package complete, deliverables JSON populated
--
-- Tiers: kinetic (no avatar — typography + TTS, ~zero marginal cost)
--        avatar  (one HeyGen master render, all cuts from it)
-- Avatar tier is wallet-gated (heygen-pipeline headroom rule) and stays
-- disabled until Bobbie tops up + gives pricing GO.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'kinetic' CHECK (tier IN ('kinetic', 'avatar')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scripted', 'rendering', 'cutting', 'delivered', 'failed')),
  brief TEXT NOT NULL,
  campaign JSONB,                                -- { master, hooks[3], postingCopy, postingPlan }
  deliverables JSONB,                            -- { videos[6], plan, copy } once delivered
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ad_campaigns_owner_idx ON ad_campaigns (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_campaigns_project_idx ON ad_campaigns (project_id);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Owners see and manage only their own campaigns
CREATE POLICY ad_campaigns_owner_select ON ad_campaigns
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY ad_campaigns_owner_insert ON ad_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY ad_campaigns_owner_update ON ad_campaigns
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read every campaign (support + review)
CREATE POLICY ad_campaigns_admin_select ON ad_campaigns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Bridge: render_jobs (020, already applied) gains the campaign link so a
-- purchased campaign's render job can find its scripting record.
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS campaign_id BIGINT REFERENCES ad_campaigns(id) ON DELETE SET NULL;
