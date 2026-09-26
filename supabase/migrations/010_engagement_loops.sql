-- Engagement Loops: per-app gamified marketing configured by the owner.
-- Each loop = an action (try the app, invite a friend, share to Facebook,
-- upgrade, post an accomplishment) + a reward (10% off, free premium
-- feature for 24h, unlock) redeemable only after completing the action.

CREATE TABLE IF NOT EXISTS engagement_loops (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action TEXT NOT NULL,            -- e.g. 'try_app', 'invite_friend', 'share_facebook', 'upgrade', 'post_accomplishment'
  action_label TEXT NOT NULL,     -- owner-facing description
  reward TEXT NOT NULL,           -- e.g. 'discount_10', 'free_feature_24h', 'unlock_premium'
  reward_label TEXT NOT NULL,      -- owner-facing description
  reward_config TEXT,             -- optional JSON: { percent: 10, hours: 24, feature: 'pro_analytics' }
  active BOOLEAN NOT NULL DEFAULT TRUE,
  wired_at BIGINT,                -- when the loop code was last generated into the app
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_loops_project ON engagement_loops(project_id);

-- RLS: owner manages their loops; admins can see all
ALTER TABLE engagement_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own loops"
  ON engagement_loops FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = engagement_loops.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "Users view own loops"
  ON engagement_loops FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = engagement_loops.project_id AND projects.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Users update own loops"
  ON engagement_loops FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = engagement_loops.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "Users delete own loops"
  ON engagement_loops FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = engagement_loops.project_id AND projects.user_id = auth.uid())
  );
