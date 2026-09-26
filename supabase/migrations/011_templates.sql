-- Templates: owners/admins can flag any built app as a reusable template.
-- Anyone can browse the gallery; forking copies the app into the forker's
-- account as their own editable project.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;

-- Public read access for template gallery (anon + authenticated can view
-- ONLY projects explicitly marked as templates)
CREATE POLICY "Public can view template projects"
  ON projects FOR SELECT
  USING (is_template = TRUE);
