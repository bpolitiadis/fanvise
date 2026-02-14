-- Daily leaders and per-scoring-period player performance snapshots.
create table if not exists public.daily_leaders (
  id uuid primary key default gen_random_uuid(),
  league_id text not null references public.leagues(league_id) on delete cascade,
  season_id text not null,
  scoring_period_id integer not null,
  period_date date,
  player_id bigint not null,
  player_name text not null,
  position_id integer,
  pro_team_id integer,
  fantasy_points numeric,
  stats jsonb not null default '{}'::jsonb,
  ownership_percent numeric,
  source text not null default 'espn_kona_player_info',
  created_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (league_id, season_id, scoring_period_id, player_id)
);

alter table public.daily_leaders enable row level security;

create policy "Daily leaders are viewable by everyone"
on public.daily_leaders for select using (true);

create index if not exists idx_daily_leaders_league_period
  on public.daily_leaders (league_id, season_id, scoring_period_id desc);

create index if not exists idx_daily_leaders_period_date
  on public.daily_leaders (period_date desc);

create index if not exists idx_daily_leaders_player_name
  on public.daily_leaders (player_name);

create index if not exists idx_daily_leaders_fantasy_points
  on public.daily_leaders (fantasy_points desc nulls last);
