-- Showcase: public app gallery for investors + viral growth loop.
-- Owners opt in per project; public pages render summary/features/demo link.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS showcase_slug TEXT;

-- Unique non-null slugs (Postgres partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_showcase_slug
  ON projects(showcase_slug) WHERE showcase_slug IS NOT NULL;

-- Public read access for showcase pages (anon + authenticated can view
-- ONLY projects explicitly made public)
CREATE POLICY "Public can view showcased projects"
  ON projects FOR SELECT
  USING (is_public = TRUE);
