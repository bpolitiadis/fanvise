-- CLEANUP: Drop old tables to ensure clean slate
drop table if exists public.user_leagues cascade;
drop table if exists public.leagues cascade;
drop table if exists public.league_memberships cascade;
drop table if exists public.teams cascade;
drop table if exists public.profiles cascade;
drop table if exists public.news_embeddings cascade;

-- Enable RLS
alter default privileges in schema public grant all on tables to postgres, service_role;

-- Enable Vector Extension
create extension if not exists vector;

-- LEAGUES: Stores static league settings/metadata
create table if not exists public.leagues (
    league_id text not null primary key, -- ESPN League ID
    season_id text not null, -- e.g., '2025'
    name text,
    scoring_settings jsonb not null default '{}'::jsonb, -- Points per block, etc.
    roster_settings jsonb not null default '{}'::jsonb, -- Roster slots breakdown
    last_updated_at timestamptz default now()
);

-- PROFILES: Extends auth.users
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  full_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- USER_LEAGUES: Maps a user to a specific team in a league
create table if not exists public.user_leagues (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    league_id text references public.leagues(league_id) on delete cascade not null,
    team_id text not null, -- The user's specific team ID in that league
    is_active boolean default false, -- Context switch toggle
    
    unique(user_id, league_id)
);

-- NEWS_EMBEDDINGS: RAG Store
create table if not exists public.news_embeddings (
  id uuid primary key default gen_random_uuid(),
  content text, -- The actual news snippet
  url text, -- Source URL
  player_name text, -- Meta-filter
  embedding vector(768), -- Google Gecko Dimension (768)
  created_at timestamptz default now()
);

-- RLS POLICIES
alter table public.leagues enable row level security;
alter table public.profiles enable row level security;
alter table public.user_leagues enable row level security;
alter table public.news_embeddings enable row level security;

-- Allow read access to leagues for authenticated users
create policy "Leagues are viewable by authenticated users" 
on public.leagues for select to authenticated using (true);

-- Allow users to manage their own profile
create policy "Users can manage own profile" 
on public.profiles for all to authenticated using (auth.uid() = id);

-- Allow users to manage their own league mappings
create policy "Users can manage own league mappings" 
on public.user_leagues for all to authenticated using (auth.uid() = user_id);

-- Allow read access to news for everyone
create policy "News is viewable by everyone" 
on public.news_embeddings for select to authenticated using (true);
