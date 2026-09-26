-- ============================================================================
-- REVERSE TRIAL: every new signup gets 3 days of Pro automatically
-- ============================================================================
-- tier_expires_at already exists (paid subs use it). The trial reuses the
-- same machinery: tier='pro' + tier_expires_at=+3d + is_trial=true.
-- App code resolves the EFFECTIVE tier at read time (src/lib/trial.ts),
-- so no cron is needed to downgrade anyone.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

-- New signups start on the Pro trial
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, tier, tier_expires_at, is_trial)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user',
    'pro',
    now() + interval '3 days',
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
