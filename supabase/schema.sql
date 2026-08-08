-- ============================================================================
-- Storyweaver — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this in the Supabase Dashboard → SQL Editor (or `supabase db push`).
-- It is idempotent: safe to run more than once.
--
-- Data model
--   auth.users          — Supabase Auth (email/password). One row per parent.
--   public.children     — child profiles owned by a parent.
--   public.stories      — generated stories, each tied to a parent and a child.
--   storage: story-images — private bucket for avatars and story covers.
--
-- Every row is owned by a parent (user_id = auth.uid()) and Row Level Security
-- ensures a parent can only ever read or write their own rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Table: children
-- ----------------------------------------------------------------------------
create table if not exists public.children (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  age         integer,
  gender      text,
  preferences text,
  avatar_url  text,                    -- storage path in the story-images bucket
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists children_user_id_idx on public.children (user_id);

-- ----------------------------------------------------------------------------
-- Table: stories
-- ----------------------------------------------------------------------------
create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  child_id    uuid references public.children (id) on delete cascade,
  "character" text not null,           -- "a brave little fox named Momo" (quoted: reserved word)
  lesson      text not null,           -- "Kindness" or a custom lesson
  bank_index  integer not null default 0,
  tldr        jsonb  not null default '[]'::jsonb,  -- array of strings
  body        text   not null,
  favorite    boolean not null default false,
  cover_url   text,                    -- storage path in the story-images bucket
  created_at  timestamptz not null default now()
);

create index if not exists stories_user_id_idx  on public.stories (user_id);
create index if not exists stories_child_id_idx on public.stories (child_id);
create index if not exists stories_created_idx  on public.stories (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at trigger for children
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists children_set_updated_at on public.children;
create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.children enable row level security;
alter table public.stories  enable row level security;

-- children: owner-only access ------------------------------------------------
drop policy if exists "children_select_own" on public.children;
create policy "children_select_own" on public.children
  for select using (auth.uid() = user_id);

drop policy if exists "children_insert_own" on public.children;
create policy "children_insert_own" on public.children
  for insert with check (auth.uid() = user_id);

drop policy if exists "children_update_own" on public.children;
create policy "children_update_own" on public.children
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "children_delete_own" on public.children;
create policy "children_delete_own" on public.children
  for delete using (auth.uid() = user_id);

-- stories: owner-only access -------------------------------------------------
drop policy if exists "stories_select_own" on public.stories;
create policy "stories_select_own" on public.stories
  for select using (auth.uid() = user_id);

drop policy if exists "stories_insert_own" on public.stories;
create policy "stories_insert_own" on public.stories
  for insert with check (auth.uid() = user_id);

drop policy if exists "stories_update_own" on public.stories;
create policy "stories_update_own" on public.stories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "stories_delete_own" on public.stories;
create policy "stories_delete_own" on public.stories
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Storage: private bucket for avatars and story covers
-- ----------------------------------------------------------------------------
-- Files are stored under a per-user folder: "<user_id>/<filename>".
-- The policies below let a parent read/write only inside their own folder.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('story-images', 'story-images', false)
on conflict (id) do nothing;

drop policy if exists "story_images_select_own" on storage.objects;
create policy "story_images_select_own" on storage.objects
  for select using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "story_images_insert_own" on storage.objects;
create policy "story_images_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "story_images_update_own" on storage.objects;
create policy "story_images_update_own" on storage.objects
  for update using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "story_images_delete_own" on storage.objects;
create policy "story_images_delete_own" on storage.objects
  for delete using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Done. Next: copy your project URL + anon key into the app (see SUPABASE_SETUP.md).
-- ============================================================================
