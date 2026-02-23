-- Player Game Logs
-- Caches per-player, per-scoring-period actual stats fetched from ESPN kona_playercard.
-- NBA scoring periods are 1-per-game-day, so each row = one game played.
-- Cache-on-read strategy: past periods are immutable once written.
-- Current/in-progress period rows are refreshed on every agent tool call.

create table if not exists public.player_game_logs (
  id                uuid        primary key default gen_random_uuid(),

  -- Identity
  player_id         bigint      not null,
  player_name       text        not null,
  season_id         text        not null,    -- e.g. '2025'
  scoring_period_id integer     not null,    -- ESPN scoring period (1 per game day)
  game_date         date,                    -- resolved calendar date (nullable, filled when known)
  pro_team_id       integer,                 -- ESPN pro team numeric ID

  -- Fantasy stats (denormalised for fast querying without touching stats_raw)
  pts               numeric,
  reb               numeric,
  ast               numeric,
  stl               numeric,
  blk               numeric,
  turnovers         numeric,                 -- "to" is a SQL reserved word
  three_pm          numeric,                 -- 3-pointers made
  fg_made           numeric,
  fg_attempted      numeric,
  fg_pct            numeric,
  ft_made           numeric,
  ft_attempted      numeric,
  ft_pct            numeric,
  minutes           numeric,
  fantasy_points    numeric,

  -- Full raw stats map from ESPN (keyed by ESPN stat ID strings)
  stats_raw         jsonb       not null default '{}'::jsonb,

  -- Metadata
  source            text        not null default 'espn_kona_playercard',
  fetched_at        timestamptz not null default now(),

  unique (player_id, season_id, scoring_period_id)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.player_game_logs enable row level security;

create policy "Player game logs are viewable by everyone"
  on public.player_game_logs for select using (true);

-- Service-role writes (agent tool upserts, no user auth needed)
create policy "Service role can upsert player game logs"
  on public.player_game_logs for all
  to service_role
  using (true)
  with check (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary agent query: "give me the last N games for player X in season Y"
create index if not exists idx_player_game_logs_player_period
  on public.player_game_logs (player_id, season_id, scoring_period_id desc);

-- Text search by player name (for tool calls that resolve by name)
create index if not exists idx_player_game_logs_player_name
  on public.player_game_logs (player_name);

-- Temporal queries (e.g. "last 7 days")
create index if not exists idx_player_game_logs_game_date
  on public.player_game_logs (game_date desc nulls last);

-- Leaderboard-style: who scored the most fantasy pts in period X?
create index if not exists idx_player_game_logs_fantasy_points
  on public.player_game_logs (season_id, scoring_period_id desc, fantasy_points desc nulls last);
