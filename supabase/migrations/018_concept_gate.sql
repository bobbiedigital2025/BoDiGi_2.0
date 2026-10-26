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
