-- 020: render_jobs — the autonomous render system's memory (Ad Studio v2, Oct 22 spec RUNE Oct 27-28)
-- Nothing depends on anyone remembering: payment → job row → provider → webhook/ffmpeg → delivery.
-- id doubles as the HeyGen inline callback_id (UUID, unguessable, echoed back on completion).

create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text,                      -- nullable: standalone campaigns need no build
  kind text not null check (kind in ('avatar', 'kinetic')),
  product text not null default 'campaign',  -- 'video_30' | 'video_long' | 'campaign'
  status text not null default 'queued'
    check (status in ('queued','rendering','rendered','finishing','done','failed','cancelled')),
  business_description text not null default '',
  script text,                          -- master script (avatar) or scene plan (kinetic)
  hook_variants jsonb,                  -- campaign: 3 hook variant texts
  brand jsonb,                           -- brand voice + palette for scenes
  assets jsonb,                         -- customer photos / screen recordings (storage paths)
  output jsonb,                         -- master + cut paths after finishing
  provider text not null check (provider in ('heygen', 'kinetic-ffmpeg')),
  provider_job_id text,                 -- HeyGen video_id
  payment_intent_id text,               -- ties to the live payment→render trigger
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rendered_at timestamptz,
  delivered_at timestamptz
);

create index if not exists render_jobs_status_idx on public.render_jobs (status);
create index if not exists render_jobs_user_idx on public.render_jobs (user_id);

alter table public.render_jobs enable row level security;

-- Owner sees and advances their own jobs; service_role bypasses RLS for the pipeline.
create policy "render_jobs owner read" on public.render_jobs
  for select using (auth.uid() = user_id);
create policy "render_jobs owner insert" on public.render_jobs
  for insert with check (auth.uid() = user_id);
create policy "render_jobs owner update" on public.render_jobs
  for update using (auth.uid() = user_id);

-- Private bucket for render outputs (customer deliverables are never public).
insert into storage.buckets (id, name, public)
values ('render-outputs', 'render-outputs', false)
on conflict (id) do nothing;

-- Owner can read their own outputs via signed URLs minted by the service role.
create policy "render outputs owner read" on storage.objects
  for select using (
    bucket_id = 'render-outputs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
