/**
 * Game Log Service
 *
 * Cache-on-read strategy for player game logs:
 * - Past scoring periods are immutable once played; data is cached indefinitely.
 * - The current/in-progress period is considered stale after CURRENT_PERIOD_TTL_MS.
 * - On a cache miss or stale current period, fetch from ESPN kona_playercard,
 *   then upsert into player_game_logs.
 *
 * @module services/game-log
 */

import { createAdminClient } from "@/utils/supabase/server";
import { EspnClient } from "@/lib/espn/client";
import { ESPN_STAT_MAPPINGS } from "@/lib/espn/constants";

// ─── Constants ────────────────────────────────────────────────────────────────

const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID!;
const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID!;
const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
const swid = process.env.ESPN_SWID;
const s2 = process.env.ESPN_S2;

/** Current-period rows are refreshed if older than this (15 min) */
const CURRENT_PERIOD_TTL_MS = 15 * 60 * 1000;

// ─── ESPN stat ID → column name map ──────────────────────────────────────────

const STAT_ID_TO_COL: Record<number, string> = {
  0: "pts",
  6: "reb",
  3: "ast",
  2: "stl",
  1: "blk",
  11: "turnovers",
  17: "three_pm",
  13: "fg_made",
  14: "fg_attempted",
  19: "fg_pct",
  15: "ft_made",
  16: "ft_attempted",
  20: "ft_pct",
  40: "minutes",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameLogEntry {
  scoringPeriodId: number;
  gameDate: string | null;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnovers: number;
  three_pm: number;
  fg_made: number;
  fg_attempted: number;
  fg_pct: number;
  ft_made: number;
  ft_attempted: number;
  ft_pct: number;
  minutes: number;
  fantasyPoints: number;
  statsLabelled: Record<string, number>;
}

export interface PlayerGameLog {
  playerId: number;
  playerName: string;
  seasonId: string;
  proTeamId: number | null;
  lastNGames: GameLogEntry[];
  /** Averages over the returned window */
  averages: {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    three_pm: number;
    fantasyPoints: number;
    gamesPlayed: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildLabelled(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [idStr, val] of Object.entries(raw)) {
    const id = parseInt(idStr, 10);
    const name = ESPN_STAT_MAPPINGS[id];
    if (name) out[name] = val;
  }
  return out;
}

function computeAverages(entries: GameLogEntry[]) {
  const n = entries.length;
  if (n === 0) {
    return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, three_pm: 0, fantasyPoints: 0, gamesPlayed: 0 };
  }
  const sum = (key: keyof GameLogEntry) =>
    entries.reduce((acc, e) => acc + safeNum(e[key]), 0);

  return {
    pts: Math.round((sum("pts") / n) * 10) / 10,
    reb: Math.round((sum("reb") / n) * 10) / 10,
    ast: Math.round((sum("ast") / n) * 10) / 10,
    stl: Math.round((sum("stl") / n) * 10) / 10,
    blk: Math.round((sum("blk") / n) * 10) / 10,
    three_pm: Math.round((sum("three_pm") / n) * 10) / 10,
    fantasyPoints: Math.round((sum("fantasyPoints") / n) * 10) / 10,
    gamesPlayed: n,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the last N game-log entries for a player.
 *
 * Flow:
 * 1. Look up the player's ESPN ID via player_status_snapshots.
 * 2. Query cached rows from player_game_logs (most recent N periods).
 * 3. If fewer than lastNGames rows found, or the most-recent row is stale,
 *    fetch from ESPN and upsert the results.
 * 4. Return structured game log with averages.
 */
export async function getPlayerGameLog(
  playerName: string,
  lastNGames: number = 10
): Promise<PlayerGameLog | null> {
  const db = createAdminClient();

  // ── 1. Resolve player ID from name ────────────────────────────────────────
  const { data: snapshots } = await db
    .from("player_status_snapshots")
    .select("player_id, player_name, pro_team_id")
    .ilike("player_name", `%${playerName}%`)
    .limit(1);

  const snapshot = snapshots?.[0];

  if (!snapshot?.player_id) {
    console.warn(`[GameLogService] Player not found in snapshots: "${playerName}"`);
    return null;
  }

  const playerId = snapshot.player_id;
  const resolvedName = snapshot.player_name;

  // ── 2. Check cache ─────────────────────────────────────────────────────────
  const { data: cached } = await db
    .from("player_game_logs")
    .select("*")
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .order("scoring_period_id", { ascending: false })
    .limit(lastNGames);

  const isCurrentPeriodStale = (rows: typeof cached) => {
    if (!rows?.length) return true;
    const mostRecent = rows[0];
    const fetchedAt = mostRecent?.fetched_at ? new Date(mostRecent.fetched_at).getTime() : 0;
    return Date.now() - fetchedAt > CURRENT_PERIOD_TTL_MS;
  };

  const hasSufficientCache =
    (cached?.length ?? 0) >= Math.min(lastNGames, 3) && !isCurrentPeriodStale(cached);

  // ── 3. Fetch from ESPN if needed ───────────────────────────────────────────
  if (!hasSufficientCache) {
    try {
      const client = new EspnClient(leagueId, seasonId, sport, swid, s2);
      const raw = await client.getPlayerGameLog([playerId], lastNGames);
      const playerData = raw[0];

      if (playerData?.stats?.length) {
        // Resolve scoringPeriodId → calendar date from nba_schedule so that
        // game_date is always populated. Without it, v_roster_value silently
        // excludes all rows (its WHERE clause filters on game_date).
        const scoringPeriodIds = playerData.stats.map((s) => s.scoringPeriodId);
        const { data: scheduleRows } = await db
          .from("nba_schedule")
          .select("scoring_period_id, date")
          .eq("season_id", seasonId)
          .in("scoring_period_id", scoringPeriodIds)
          .or(`home_team_id.eq.${playerData.proTeamId},away_team_id.eq.${playerData.proTeamId}`);

        const periodToDate = new Map<number, string>(
          (scheduleRows ?? []).map((r) => [
            r.scoring_period_id as number,
            (r.date as string).split("T")[0],
          ])
        );

        const rows = playerData.stats.map((s) => {
          const statsMap = s.stats ?? {};
          const get = (id: number) => safeNum(statsMap[String(id)]);

          return {
            player_id: playerId,
            player_name: resolvedName,
            season_id: seasonId,
            scoring_period_id: s.scoringPeriodId,
            game_date: periodToDate.get(s.scoringPeriodId) ?? null,
            pro_team_id: playerData.proTeamId,
            pts: get(0),
            reb: get(6),
            ast: get(3),
            stl: get(2),
            blk: get(1),
            turnovers: get(11),
            three_pm: get(17),
            fg_made: get(13),
            fg_attempted: get(14),
            fg_pct: get(19),
            ft_made: get(15),
            ft_attempted: get(16),
            ft_pct: get(20),
            minutes: get(40),
            fantasy_points: safeNum(s.appliedTotal),
            stats_raw: statsMap,
            source: "espn_kona_playercard",
            fetched_at: new Date().toISOString(),
          };
        });

        await db
          .from("player_game_logs")
          .upsert(rows, { onConflict: "player_id,season_id,scoring_period_id" });
      }
    } catch (err) {
      console.error(`[GameLogService] ESPN fetch failed for player ${playerId}:`, err);
      // Fall through to return whatever we have cached
    }
  }

  // ── 4. Final read (includes newly upserted rows) ───────────────────────────
  const { data: rows } = await db
    .from("player_game_logs")
    .select("*")
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .order("scoring_period_id", { ascending: false })
    .limit(lastNGames);

  if (!rows?.length) return null;

  const entries: GameLogEntry[] = rows.map((r) => ({
    scoringPeriodId: r.scoring_period_id,
    gameDate: r.game_date,
    pts: safeNum(r.pts),
    reb: safeNum(r.reb),
    ast: safeNum(r.ast),
    stl: safeNum(r.stl),
    blk: safeNum(r.blk),
    turnovers: safeNum(r.turnovers),
    three_pm: safeNum(r.three_pm),
    fg_made: safeNum(r.fg_made),
    fg_attempted: safeNum(r.fg_attempted),
    fg_pct: safeNum(r.fg_pct),
    ft_made: safeNum(r.ft_made),
    ft_attempted: safeNum(r.ft_attempted),
    ft_pct: safeNum(r.ft_pct),
    minutes: safeNum(r.minutes),
    fantasyPoints: safeNum(r.fantasy_points),
    statsLabelled: buildLabelled(
      (r.stats_raw as Record<string, number> | null) ?? {}
    ),
  }));

  return {
    playerId,
    playerName: resolvedName,
    seasonId,
    proTeamId: rows[0]?.pro_team_id ?? null,
    lastNGames: entries,
    averages: computeAverages(entries),
  };
}
