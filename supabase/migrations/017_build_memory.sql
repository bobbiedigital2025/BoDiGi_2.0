-- 017: Build Memory — the platform learning loop.
-- Every build, modification pass, and failure writes a lesson here.
-- Every agent reads the relevant lessons before generating code.
-- This is what makes BoDiGi smarter with each build instead of
-- every build starting from zero.

create table if not exists public.build_lessons (
  id uuid primary key default gen_random_uuid(),
  agent_role text not null default 'general',       -- frontend | backend | database | pm | architect | general
  lesson text not null,                              -- one concise, actionable rule
  category text not null default 'quality',          -- bug-pattern | user-preference | quality | structure
  source text not null default 'build-review',       -- build-review | modify-pass | failure | manual
  project_id text,                                   -- where the lesson came from (traceability)
  applied_count integer not null default 0,          -- how often it has been served to an agent
  created_at timestamptz not null default now()
);

create index if not exists build_lessons_role_created_idx
  on public.build_lessons (agent_role, created_at desc);

alter table public.build_lessons enable row level security;

-- Server-only table: no anon/authenticated policies at all.
-- Default-deny for every role; the service role (pipeline + routes)
-- bypasses RLS and is the only reader/writer.

-- Tracks how often a lesson gets served to an agent (reinforcement signal).
create or replace function public.increment_lesson_applied(lesson_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.build_lessons
  set applied_count = applied_count + 1
  where id = lesson_id;
$$;

-- Seed lessons we already learned the hard way, so the first build
-- after this ships with a head start instead of an empty brain.
insert into public.build_lessons (agent_role, lesson, category, source) values
  ('frontend', 'Auth pages must include a sign-in/create-account toggle, a forgot-password link, and a password visibility eye icon.', 'bug-pattern', 'manual'),
  ('frontend', 'Every generated app needs a settings page reachable from the main navigation.', 'user-preference', 'manual'),
  ('frontend', 'Every page needs a visible way back to the dashboard or home screen — never trap the user on a sub-page.', 'quality', 'manual'),
  ('backend', 'Return consistent JSON error shapes ({error: message}) with correct status codes from every API route — the frontend parses them.', 'quality', 'manual')
on conflict do nothing;
