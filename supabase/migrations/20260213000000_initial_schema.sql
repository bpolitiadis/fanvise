-- Initial Schema
-- Combines news_schema, core_schema, nba_schedule, and news_guid migrations.

-- 1. Extensions
create extension if not exists vector;

-- 2. Tables

-- LEAGUES: Stores static league settings/metadata
create table if not exists public.leagues (
    league_id text not null primary key, -- ESPN League ID
    season_id text not null, -- e.g., '2025'
    name text,
    scoring_settings jsonb not null default '{}'::jsonb,
    roster_settings jsonb not null default '{}'::jsonb,
    teams jsonb not null default '[]'::jsonb,
    draft_detail jsonb not null default '{}'::jsonb,
    positional_ratings jsonb not null default '{}'::jsonb,
    live_scoring jsonb not null default '{}'::jsonb,
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

-- LEAGUE_TRANSACTIONS: Stores transaction history
create table if not exists public.league_transactions (
    id uuid primary key default gen_random_uuid(),
    league_id text references public.leagues(league_id) on delete cascade not null,
    espn_transaction_id text unique not null,
    type text,
    description text,
    published_at timestamptz not null,
    created_at timestamptz default now()
);

-- NEWS_ITEMS: Stores fetched news (with vector embeddings)
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text unique not null,
  content text,
  summary text,
  published_at timestamptz not null,
  source text not null,
  player_name text,
  sentiment text,
  category text,
  impact_backup text,
  is_injury_report boolean default false,
  injury_status text,
  expected_return_date text,
  impacted_player_ids text[] default '{}',
  trust_level int default 3,
  embedding vector(768),
  guid text, -- Added for accurate deduplication
  created_at timestamptz default now()
);

-- NBA_SCHEDULE: Stores game schedule
create table if not exists public.nba_schedule (
  id text not null primary key, -- ESPN Game ID
  date timestamp with time zone not null,
  home_team_id integer not null,
  away_team_id integer not null,
  season_id text not null,
  scoring_period_id integer,
  created_at timestamp with time zone not null default now()
);

-- 3. Functions

-- match_news_documents: Search news by embedding similarity
create or replace function match_news_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  days_back int default 7
)
returns table (
  id uuid,
  title text,
  url text,
  content text,
  summary text,
  published_at timestamptz,
  source text,
  player_name text,
  sentiment text,
  category text,
  impact_backup text,
  is_injury_report boolean,
  injury_status text,
  expected_return_date text,
  impacted_player_ids text[],
  trust_level int,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    news_items.id,
    news_items.title,
    news_items.url,
    news_items.content,
    news_items.summary,
    news_items.published_at,
    news_items.source,
    news_items.player_name,
    news_items.sentiment,
    news_items.category,
    news_items.impact_backup,
    news_items.is_injury_report,
    news_items.injury_status,
    news_items.expected_return_date,
    news_items.impacted_player_ids,
    news_items.trust_level,
    1 - (news_items.embedding <=> query_embedding) as similarity
  from news_items
  where 1 - (news_items.embedding <=> query_embedding) > match_threshold
    and news_items.published_at > now() - (days_back || ' days')::interval
  order by similarity desc, news_items.published_at desc
  limit match_count;
end;
$$;

-- 4. RLS & Policies

-- Enable RLS
alter table public.leagues enable row level security;
alter table public.profiles enable row level security;
alter table public.user_leagues enable row level security;
alter table public.league_transactions enable row level security;
alter table public.news_items enable row level security;
alter table public.nba_schedule enable row level security;

-- RLS POLICIES
create policy "Leagues are viewable by everyone" 
on public.leagues for select using (true);

create policy "Users can manage own profile" 
on public.profiles for all to authenticated using (auth.uid() = id);

create policy "Users can manage own league mappings" 
on public.user_leagues for all using (true); -- Relaxed for local dev

create policy "Transactions are viewable by everyone" 
on public.league_transactions for select using (true);

create policy "News is viewable by everyone" 
on public.news_items for select using (true);

create policy "Allow authenticated users to read schedule"
on public.nba_schedule for select
to authenticated
using (true);

-- 5. Indexes

create index if not exists idx_nba_schedule_date on public.nba_schedule(date);
create index if not exists idx_nba_schedule_home_team on public.nba_schedule(home_team_id);
create index if not exists idx_nba_schedule_away_team on public.nba_schedule(away_team_id);
create index if not exists idx_nba_schedule_season_scoring on public.nba_schedule(season_id, scoring_period_id);
create index if not exists news_items_guid_idx on public.news_items(guid);
