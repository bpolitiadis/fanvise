-- Optimizer Views: Pre-calculated data to support the deterministic LineupOptimizer engine.
--
-- These views replace expensive on-the-fly calculations for:
--   1. v_roster_value   — per-player rolling 21-day stats for scoring-aware drop analysis
--   2. v_streaming_candidates — free-agent schedule context for streaming recommendations
--
-- The AI never sees raw rows; it consumes the service layer which reads these views.
-- Keeping math in SQL eliminates token waste and cuts agent latency by ~1-2s per turn.

-- ─── 1. v_roster_value ───────────────────────────────────────────────────────
-- Rolling 21-day per-player averages and volatility.
-- Used by OptimizerService.scoreDroppingCandidate() to produce a league-relative drop score.

create or replace view public.v_roster_value as
select
    pgl.player_id,
    pgl.player_name,
    count(*)                                 as recent_games,
    round(avg(pgl.fantasy_points)::numeric, 2)  as avg_fpts,
    round(coalesce(stddev(pgl.fantasy_points), 0)::numeric, 2) as fpts_volatility,
    round(max(pgl.fantasy_points)::numeric, 2)  as max_fpts,
    round(min(pgl.fantasy_points)::numeric, 2)  as min_fpts,
    max(pgl.game_date)                       as last_played,
    avg(pgl.pts)  as avg_pts,
    avg(pgl.reb)  as avg_reb,
    avg(pgl.ast)  as avg_ast,
    avg(pgl.stl)  as avg_stl,
    avg(pgl.blk)  as avg_blk
from public.player_game_logs pgl
where pgl.game_date >= current_date - interval '21 days'
group by pgl.player_id, pgl.player_name;

-- ─── 2. v_streaming_candidates ───────────────────────────────────────────────
-- Combines player status, rolling avg_fpts, and the current-week NBA schedule
-- into a single queryable surface for free-agent streaming analysis.
--
-- "Current week" is defined as today through next Sunday (end of fantasy week).
-- The coalesce handles NULL ownership gracefully.

create or replace view public.v_streaming_candidates as
select
    pss.player_id,
    pss.player_name,
    pss.injury_status,
    pss.injured,
    pss.pro_team_id,
    coalesce((pss.ownership ->> 'percentOwned')::numeric, 0)  as pct_owned,
    coalesce(rv.avg_fpts, 0)                                   as avg_fpts,
    coalesce(rv.fpts_volatility, 0)                            as fpts_volatility,
    coalesce(rv.recent_games, 0)                               as recent_games,
    count(ns.id)                                               as games_this_week,
    coalesce(
        array_agg(ns.date::date order by ns.date::date)
        filter (where ns.id is not null),
        '{}'::date[]
    )                                                          as game_dates_this_week
from public.player_status_snapshots pss
left join public.v_roster_value rv
    on rv.player_id = pss.player_id
left join public.nba_schedule ns
    on (ns.home_team_id = pss.pro_team_id or ns.away_team_id = pss.pro_team_id)
    and ns.date >= now()
    and ns.date <= date_trunc('week', now()) + interval '6 days 23 hours 59 minutes'
where pss.injury_status in ('ACTIVE', 'DTD', 'GTD', 'QUESTIONABLE')
  and not coalesce(pss.injured, false)
group by
    pss.player_id,
    pss.player_name,
    pss.injury_status,
    pss.injured,
    pss.pro_team_id,
    pss.ownership,
    rv.avg_fpts,
    rv.fpts_volatility,
    rv.recent_games;

-- ─── Indexes supporting view performance ─────────────────────────────────────
-- game_date index accelerates the 21-day window filter in v_roster_value
create index if not exists idx_player_game_logs_game_date
    on public.player_game_logs (game_date);

-- pro_team_id index accelerates schedule joins in v_streaming_candidates
create index if not exists idx_player_status_snapshots_pro_team_id
    on public.player_status_snapshots (pro_team_id);

-- nba_schedule date+team composite index for range queries
create index if not exists idx_nba_schedule_date_teams
    on public.nba_schedule (date, home_team_id, away_team_id);
