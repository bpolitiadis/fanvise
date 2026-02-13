-- Create table for NBA schedule
create table if not exists public.nba_schedule (
  id text not null primary key, -- ESPN Game ID
  date timestamp with time zone not null,
  home_team_id integer not null,
  away_team_id integer not null,
  season_id text not null,
  scoring_period_id integer,
  created_at timestamp with time zone not null default now()
);

-- Enable RLS (though public access might be needed depending on auth setup, best practice is enabling)
alter table public.nba_schedule enable row level security;

-- Allow authenticated users to read schedule (or everyone if public data)
-- For now, allow authenticated reads
create policy "Allow authenticated users to read schedule"
on public.nba_schedule for select
to authenticated
using (true);

-- Indexes for performance
create index if not exists idx_nba_schedule_date on public.nba_schedule(date);
create index if not exists idx_nba_schedule_home_team on public.nba_schedule(home_team_id);
create index if not exists idx_nba_schedule_away_team on public.nba_schedule(away_team_id);
create index if not exists idx_nba_schedule_season_scoring on public.nba_schedule(season_id, scoring_period_id);
