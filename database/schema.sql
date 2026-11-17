-- MIX DJ - MUNIX AI
-- Complete PostgreSQL / Supabase Database Schema & Row Level Security (RLS) Policies

create extension if not exists "pgcrypto";

-- 1. profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  avatar_url text,
  bio text default '',
  email_verified boolean not null default false,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. user_roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'moderator', 'admin')) default 'user',
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Helper function to check admin role in RLS
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid and role = 'admin'
  );
$$;

-- 3. music_projects
create table if not exists public.music_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null default 'Afrobeat',
  project_type text not null check (project_type in ('dj_mix', 'ai_song', 'audio_edit', 'voice_drop')) default 'dj_mix',
  bpm numeric(6,2) default 118,
  duration_sec integer default 0,
  cover_url text,
  audio_file_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. audio_files
create table if not exists public.audio_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  artist text default 'Unknown Artist',
  category text not null default 'Uploads',
  storage_path text not null,
  mime_type text not null default 'audio/wav',
  file_size_bytes bigint not null default 0,
  duration_sec numeric(10,2) default 0,
  bpm numeric(6,2) default 120,
  is_public boolean not null default false,
  is_featured boolean not null default false,
  source_type text not null check (source_type in ('upload', 'recording', 'ai_music', 'voice', 'edited', 'stem')) default 'upload',
  created_at timestamptz not null default now()
);

-- 5. generated_music
create table if not exists public.generated_music (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  prompt text not null,
  genre text not null,
  mood text not null,
  language text not null,
  voice_gender text check (voice_gender in ('male', 'female', 'none')) default 'female',
  instrumental_only boolean not null default false,
  duration_sec integer default 30,
  lyrics text default '',
  provider text not null,
  status text not null check (status in ('completed', 'blueprint_only', 'failed', 'pending')) default 'pending',
  audio_file_id uuid references public.audio_files(id) on delete set null,
  arrangement_json jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6. voice_profiles
create table if not exists public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('dj_munix_authorized', 'ai_voice', 'user_recording')),
  name text not null,
  language text not null default 'English',
  voice_tone text not null default 'Clear Studio',
  script_text text default '',
  authorized_by_owner boolean not null default false,
  audio_file_id uuid references public.audio_files(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- 7. sound_effects
create table if not exists public.sound_effects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  category text not null,
  effect_type text not null,
  description text default '',
  default_params jsonb not null default '{}'::jsonb,
  audio_file_id uuid references public.audio_files(id) on delete set null,
  is_global boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 8. notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade, -- NULL means global broadcast
  title text not null,
  message text not null,
  kind text not null check (kind in ('announcement', 'system', 'music', 'admin')) default 'announcement',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 9. admin_settings
create table if not exists public.admin_settings (
  id text primary key default 'global',
  app_name text not null default 'MIX DJ – MUNIX AI',
  brand_name text not null default 'DJ MUNIX',
  ai_studio_name text not null default 'MUNIX AI',
  logo_url text not null,
  hero_image_url text not null,
  hero_title text not null,
  hero_subtitle text not null,
  theme_accent text not null default '#10b981',
  theme_gold text not null default '#d4af37',
  enabled_sections jsonb not null default '{"featured":true,"recent":true,"popular":true,"aiNew":true,"categories":true,"announcements":true}'::jsonb,
  ai_config jsonb not null default '{"musicProvider":"lyria","dailyLimit":20,"voiceEnabled":true,"munixVoiceAuthorized":true}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 10. usage_logs
create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  feature text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 11. audit_logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text not null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security on ALL tables
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.music_projects enable row level security;
alter table public.audio_files enable row level security;
alter table public.generated_music enable row level security;
alter table public.voice_profiles enable row level security;
alter table public.sound_effects enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_settings enable row level security;
alter table public.usage_logs enable row level security;
alter table public.audit_logs enable row level security;

-- RLS Policies
create policy "Users view own profile or admin views all" on public.profiles
  for select using (auth.uid() = id or public.is_admin(auth.uid()));
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Admins manage all profiles" on public.profiles
  for all using (public.is_admin(auth.uid()));

create policy "Users view own role" on public.user_roles
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));
create policy "Only admins modify roles" on public.user_roles
  for all using (public.is_admin(auth.uid()));

create policy "Private projects owner or public read" on public.music_projects
  for select using (user_id = auth.uid() or is_public = true or public.is_admin(auth.uid()));
create policy "Users manage own projects" on public.music_projects
  for all using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "Private audio files owner or public read" on public.audio_files
  for select using (user_id = auth.uid() or is_public = true or public.is_admin(auth.uid()));
create policy "Users manage own audio files" on public.audio_files
  for all using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "Users manage own generated music" on public.generated_music
  for all using (user_id = auth.uid() or is_public = true or public.is_admin(auth.uid()));

create policy "Users manage own voice profiles" on public.voice_profiles
  for all using (user_id = auth.uid() or is_public = true or public.is_admin(auth.uid()));

create policy "Anyone reads active global effects" on public.sound_effects
  for select using ((is_global = true and is_active = true) or created_by = auth.uid() or public.is_admin(auth.uid()));
create policy "Users create personal effects; admins manage all" on public.sound_effects
  for all using (created_by = auth.uid() or public.is_admin(auth.uid()));

create policy "Users read own or broadcast notifications" on public.notifications
  for select using (user_id = auth.uid() or user_id is null or public.is_admin(auth.uid()));
create policy "Only admins create broadcast notifications" on public.notifications
  for insert with check (public.is_admin(auth.uid()));

create policy "Anyone reads public admin settings" on public.admin_settings
  for select using (true);
create policy "Only admins update admin settings" on public.admin_settings
  for all using (public.is_admin(auth.uid()));

create policy "Users insert own usage logs; admins read all" on public.usage_logs
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "Users insert own usage" on public.usage_logs
  for insert with check (user_id = auth.uid());

create policy "Only admins read audit logs" on public.audit_logs
  for select using (public.is_admin(auth.uid()));
create policy "Only admins write audit logs" on public.audit_logs
  for insert with check (public.is_admin(auth.uid()));
