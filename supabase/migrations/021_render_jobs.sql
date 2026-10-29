-- ============================================================================
-- 021 — RENDER JOBS (autonomous render system, Bobbie directive Oct 28)
-- One queue table for every render the studio fires: avatar (HeyGen v3)
-- and kinetic (our ffmpeg renderer). The platform owns state; the render
-- workers own the work. Nothing depends on anyone remembering.
--
-- Lifecycle: queued → rendering → finishing → done
--            (+ failed; one automatic retry then honest-fail for a human)
--   queued   — row created, awaiting a worker claim
--   rendering— avatar: HeyGen v3 job in flight (provider_job_id set,
--              completion via v3 inline callback, callback_id = this row's
--              uuid); kinetic: sandbox ffmpeg worker rendering
--   finishing— raw output downloaded; post-production (cuts, endcard,
--              badge, QR) in flight
--   done     — deliverables uploaded + customer emailed, links stored
--
-- Idempotency rules (webhook handler honors these):
--   - status flips forward only (queued→rendering→finishing→done)
--   - duplicate callback delivery = no-op (same status → skip)
--   - callback_id is the row uuid — unguessable correlation key
-- ============================================================================

CREATE TABLE IF NOT EXISTS render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('avatar', 'kinetic')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'rendering', 'finishing', 'done', 'failed')),
  script JSONB,                                  -- the scene plan being rendered
  avatar TEXT,                                   -- HeyGen avatar id (avatar jobs)
  voice TEXT,                                    -- voice id (avatar jobs)
  provider_job_id TEXT,                          -- HeyGen v3 video id once submitted
  deliverables JSONB,                            -- uploaded file URLs once done
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS render_jobs_status_idx ON render_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS render_jobs_owner_idx ON render_jobs (user_id, created_at DESC);

ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;

-- Owners see their own render jobs
CREATE POLICY render_jobs_owner_select ON render_jobs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- The webhook route + sandbox workers write via the service role (RLS bypass);
-- customers never write render jobs directly — the render trigger creates them
-- after payment clears (same pattern as video_render_purchases).

-- Admins can read every render job (support + honest-fail triage)
CREATE POLICY render_jobs_admin_select ON render_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );


-- Private bucket for raw + finished render assets (paid deliverables —
-- customers receive expiring signed URLs, never public links).
INSERT INTO storage.buckets (id, name, public)
VALUES ('render-assets', 'render-assets', false)
ON CONFLICT (id) DO NOTHING;
