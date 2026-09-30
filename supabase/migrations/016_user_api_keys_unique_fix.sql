-- 016: Fix user_api_keys uniqueness for multi-var providers
--
-- Migration 004 created UNIQUE(user_id, project_id, provider), which
-- silently broke providers that need MULTIPLE keys per app — e.g. Supabase
-- (Project URL + anon key + service key = 3 rows under one provider).
-- The second insert always failed on the 3-part constraint.
--
-- The codebase write path (settings + per-app key panels) is scoped to
-- user + project + provider + key_name, so the constraint now matches it.
--
-- Applied live to production Sep 30 via SQL editor (Juno); this file
-- codifies it so fresh installs get the correct schema. Idempotent.

ALTER TABLE user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_user_id_project_id_provider_key;

ALTER TABLE user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_user_id_project_id_provider_key_key_name_key;

ALTER TABLE user_api_keys
  ADD CONSTRAINT user_api_keys_user_project_provider_keyname_unique
  UNIQUE (user_id, project_id, provider, key_name);
