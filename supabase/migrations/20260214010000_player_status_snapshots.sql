-- Canonical ESPN player status snapshots for injury/availability guardrails.
create table if not exists public.player_status_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null unique,
  player_name text not null,
  pro_team_id integer,
  fantasy_team_id integer,
  injured boolean default false,
  injury_status text,
  injury_type text,
  out_for_season boolean default false,
  expected_return_date date,
  last_news_date timestamptz,
  droppable boolean,
  lineup_locked boolean,
  trade_locked boolean,
  starter_status jsonb not null default '{}'::jsonb,
  ownership jsonb not null default '{}'::jsonb,
  source text not null default 'espn_kona_playercard',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.player_status_snapshots enable row level security;

create policy "Player status snapshots are viewable by everyone"
on public.player_status_snapshots for select using (true);

create index if not exists idx_player_status_snapshots_name on public.player_status_snapshots(player_name);
create index if not exists idx_player_status_snapshots_injury on public.player_status_snapshots(injury_status);
create index if not exists idx_player_status_snapshots_last_news on public.player_status_snapshots(last_news_date desc);
