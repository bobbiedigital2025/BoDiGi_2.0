-- Add 'github' as an allowed API key provider (for GitHub export feature)
-- Run in Supabase SQL Editor

-- Drop and recreate the constraint to include 'github'
ALTER TABLE user_api_keys
  DROP CONSTRAINT user_api_keys_provider_check;

ALTER TABLE user_api_keys
  ADD CONSTRAINT user_api_keys_provider_check
  CHECK (provider IN ('telnyx', 'supabase', 'vercel', 'openai', 'anthropic', 'github', 'custom'));
