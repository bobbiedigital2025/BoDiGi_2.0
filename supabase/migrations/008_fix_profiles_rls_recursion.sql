-- Fix: infinite recursion in profiles RLS.
-- "Admins can view all profiles" subqueried profiles itself, so EVERY
-- profile read failed with "infinite recursion" — users looked free,
-- admins were locked out. The support_tickets admin policy has the
-- same pattern and would break the same way.
-- Fix: a SECURITY DEFINER function reads profiles bypassing RLS.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage all tickets" ON support_tickets;
CREATE POLICY "Admins manage all tickets"
  ON support_tickets
  USING (public.is_admin());
