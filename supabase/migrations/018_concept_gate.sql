-- ============================================================================
-- 018 — CONCEPT APPROVAL GATE (Bobbie's funnel catch, Oct 22 lock)
-- One gate, two jobs: (1) the founder approves the concept before the build
-- burns; (2) the content classifier catches adult/borderline content pre-burn.
--
-- Lifecycle: drafting → presented ⇄ iterating → approved → building
--            (+ blocked | flagged | cancelled side states)
--   blocked  — classifier says explicit adult content; no card flow, no build
--   flagged  — classifier says borderline; card shown, build waits for admin clear
--   cancelled— founder abandons the concept before approving
--
-- Gate scope: standard idea path only (template forks / admin bypass excluded).
-- The modify pass is classifier-welded (see modify route) but not gate-gated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,                          -- concept-<ts>-<rand>
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL DEFAULT 'idea',          -- 'idea' | 'interview'
  source_idea TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafting',
  card JSONB,                                  -- ConceptCard: name, tagline, pitch, screens[], mustHaves[], notBuilding[], look
  card_version INTEGER NOT NULL DEFAULT 0,
  iterations JSONB NOT NULL DEFAULT '[]',       -- [{ feedback, card, at }]
  classifier TEXT NOT NULL DEFAULT 'pending',   -- pending | clean | borderline | blocked
  classifier_reason TEXT,
  project_id TEXT,                              -- linked project once building
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin review queue: flagged concepts, newest first
CREATE INDEX IF NOT EXISTS concepts_status_idx ON concepts (status, created_at DESC);

ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;

-- Founders see and edit only their own concepts
CREATE POLICY concepts_owner_select ON concepts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY concepts_owner_insert ON concepts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY concepts_owner_update ON concepts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read every concept (flagged-content review)
CREATE POLICY concepts_admin_read ON concepts
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- CANCEL SWITCH (paired hardening, same changeset)
-- projects.status is free-form TEXT; 'cancelled' is now a first-class value.
-- The pipeline aborts at its next persistence boundary once status flips,
-- and the resume relay refuses to relaunch cancelled builds.
-- (Oct 22 incident: a cancelled build's relay completed underneath and
--  overwrote the kill. This weld closes that seam.)
-- ============================================================================

-- Projects cancelled by their owner, newest first — the watchdog and the
-- resume relay both probe this cheaply.
CREATE INDEX IF NOT EXISTS projects_status_cancelled_idx
  ON projects (status) WHERE status = 'cancelled';

-- ============================================================================
-- SECURITY AUDIT LOGS — the CTO seat's append-only verdict trail
-- (spec v1, RUNE-reviewed Oct 25; folded into 018 so Bobbie's Monday paste
--  stays ONE file — changeset owner's call)
--
-- Posture: dead twice over for non-service callers —
--   RLS enabled with ZERO policies (no row is selectable via role-based
--   paths) + explicit REVOKE from anon/authenticated.
--   service_role: SELECT + INSERT only — an audit trail is append-only;
--   UPDATE/DELETE revoked so verdicts cannot be rewritten after the fact.
-- No FK on project_id by design: audit evidence outlives the artifact —
-- a deleted project's findings must survive.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id TEXT,
  audited_by TEXT NOT NULL,
  audit_kind TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('clean', 'flagged', 'quarantined')),
  rubric_version TEXT,
  scanner_version TEXT,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT
);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;  -- intentionally NO policies
REVOKE ALL ON public.security_audit_logs FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.security_audit_logs FROM service_role;
GRANT SELECT, INSERT ON public.security_audit_logs TO service_role;

CREATE INDEX IF NOT EXISTS idx_sal_project_id ON public.security_audit_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_sal_created_at ON public.security_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_verdict ON public.security_audit_logs (verdict);
