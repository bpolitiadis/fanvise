import { EspnClient } from "@/lib/espn/client";
import { createAdminClient } from "@/utils/supabase/server";

interface DailyLeadersIntent {
  enabled: boolean;
  targetsMyTeam: boolean;
  targetsFreeAgents: boolean;
  targetDate: Date;
}

interface UpsertDailyLeadersOptions {
  leagueId: string;
  seasonId: string;
  scoringPeriodId: number;
  periodDate: string;
  limit?: number;
}

interface DailyLeaderUpsertRow {
  league_id: string;
  season_id: string;
  scoring_period_id: number;
  period_date: string;
  player_id: number;
  player_name: string;
  position_id: number | null;
  pro_team_id: number | null;
  fantasy_points: number | null;
  stats: Record<string, unknown>;
  ownership_percent: number | null;
  source: string;
  last_synced_at: string;
}

interface DailyLeaderQueryRow {
  player_id: number;
  player_name: string;
  fantasy_points: number | null;
  ownership_percent: number | null;
}

const LEADER_TERMS = [
  "leader",
  "leaders",
  "daily",
  "shined",
  "shine",
  "performed",
  "top performer",
  "went off",
];

const YESTERDAY_TERMS = ["yesterday", "last night"];
const MY_TEAM_TERMS = ["my team", "our team", "my roster", "our roster"];
const FREE_AGENT_TERMS = ["free agent", "free agents", "waiver", "waivers", "wire"];

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const parseIntent = (query: string): DailyLeadersIntent => {
  const normalized = query.toLowerCase();
  const mentionsLeaders = LEADER_TERMS.some((term) => normalized.includes(term));
  const mentionsYesterday = YESTERDAY_TERMS.some((term) => normalized.includes(term));
  const targetsMyTeam = MY_TEAM_TERMS.some((term) => normalized.includes(term));
  const targetsFreeAgents = FREE_AGENT_TERMS.some((term) => normalized.includes(term));
  const enabled = mentionsLeaders || mentionsYesterday || targetsMyTeam || targetsFreeAgents;

  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  targetDate.setUTCHours(0, 0, 0, 0);

  if (!mentionsYesterday && normalized.includes("today")) {
    targetDate.setUTCDate(now.getUTCDate());
  }

  return {
    enabled,
    targetsMyTeam,
    targetsFreeAgents,
    targetDate,
  };
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveScoringPeriodForDate = async (
  seasonId: string,
  targetDate: string
): Promise<number | null> => {
  const supabase = createAdminClient();

  const { data: exactRow } = await supabase
    .from("nba_schedule")
    .select("scoring_period_id")
    .eq("season_id", seasonId)
    .gte("date", `${targetDate}T00:00:00.000Z`)
    .lt("date", `${targetDate}T23:59:59.999Z`)
    .not("scoring_period_id", "is", null)
    .order("scoring_period_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const exactPeriod = toNumber(exactRow?.scoring_period_id);
  if (exactPeriod !== null) return exactPeriod;

  const { data: fallbackRow } = await supabase
    .from("nba_schedule")
    .select("scoring_period_id,date")
    .eq("season_id", seasonId)
    .lte("date", `${targetDate}T23:59:59.999Z`)
    .not("scoring_period_id", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return toNumber(fallbackRow?.scoring_period_id);
};

const extractStatsForPeriod = (entry: Record<string, unknown>, scoringPeriodId: number) => {
  const player = (entry.player && typeof entry.player === "object")
    ? (entry.player as Record<string, unknown>)
    : null;

  const stats = Array.isArray(player?.stats)
    ? (player?.stats as Record<string, unknown>[])
    : [];

  // Per-period actual stats: statSourceId=0 (actual), statSplitTypeId=1 (per-period)
  const exact = stats.find((stat) => {
    const period = toNumber(stat.scoringPeriodId);
    const sourceId = toNumber(stat.statSourceId);
    const splitType = toNumber(stat.statSplitTypeId);
    return period === scoringPeriodId && sourceId === 0 && splitType === 1;
  });

  if (exact) return exact;

  // Relaxed match: correct period, actual source, any split type
  const periodMatch = stats.find((stat) => {
    const period = toNumber(stat.scoringPeriodId);
    const sourceId = toNumber(stat.statSourceId);
    return period === scoringPeriodId && sourceId === 0;
  });

  if (periodMatch) return periodMatch;

  // Last resort: any actual stat entry (season totals)
  return stats.find((stat) => toNumber(stat.statSourceId) === 0) || null;
};

export async function syncDailyLeadersForDate(
  leagueId: string,
  seasonId: string,
  date?: Date
): Promise<{ count: number; scoringPeriodId: number; periodDate: string } | null> {
  const target = date ? new Date(date) : new Date();
  if (!date) target.setUTCDate(target.getUTCDate() - 1);
  target.setUTCHours(0, 0, 0, 0);

  const periodDate = toDateOnly(target);
  const scoringPeriodId = await resolveScoringPeriodForDate(seasonId, periodDate);
  if (!scoringPeriodId) return null;

  const count = await upsertDailyLeadersForDate({
    leagueId,
    seasonId,
    scoringPeriodId,
    periodDate,
  });

  return { count, scoringPeriodId, periodDate };
}

export async function upsertDailyLeadersForDate(options: UpsertDailyLeadersOptions): Promise<number> {
  const {
    leagueId,
    seasonId,
    scoringPeriodId,
    periodDate,
    limit = 250,
  } = options;

  const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
  const swid = process.env.ESPN_SWID;
  const s2 = process.env.ESPN_S2;
  const client = new EspnClient(leagueId, seasonId, sport, swid, s2);
  const leaders = await client.getLeadersForScoringPeriod(scoringPeriodId, limit);

  const rows = leaders
    .map((leader: unknown): DailyLeaderUpsertRow | null => {
      if (!leader || typeof leader !== "object") return null;
      const entry = leader as Record<string, unknown>;
      const player = (entry.player && typeof entry.player === "object")
        ? (entry.player as Record<string, unknown>)
        : null;
      if (!player) return null;

      const playerId = toNumber(player.id);
      const playerName = typeof player.fullName === "string" ? player.fullName : null;
      if (playerId === null || !playerName) return null;

      const periodStats = extractStatsForPeriod(entry, scoringPeriodId);
      const statsPayload = periodStats && typeof periodStats.stats === "object"
        ? (periodStats.stats as Record<string, unknown>)
        : {};
      const fantasyPoints = toNumber(entry.appliedStatTotal)
        ?? toNumber(periodStats?.appliedTotal)
        ?? null;

      const ownership = (player.ownership && typeof player.ownership === "object")
        ? (player.ownership as Record<string, unknown>)
        : null;
      const ownershipPercent = toNumber(ownership?.percentOwned);

      return {
        league_id: leagueId,
        season_id: seasonId,
        scoring_period_id: scoringPeriodId,
        period_date: periodDate,
        player_id: Math.floor(playerId),
        player_name: playerName,
        position_id: toNumber(player.defaultPositionId),
        pro_team_id: toNumber(player.proTeamId),
        fantasy_points: fantasyPoints,
        stats: statsPayload,
        ownership_percent: ownershipPercent,
        source: "espn_kona_player_info",
        last_synced_at: new Date().toISOString(),
      };
    })
    .filter((row: DailyLeaderUpsertRow | null): row is DailyLeaderUpsertRow => row !== null);

  if (rows.length === 0) {
    return 0;
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("daily_leaders")
    .upsert(rows, { onConflict: "league_id,season_id,scoring_period_id,player_id" });

  if (error) {
    throw new Error(`[Daily Leaders] Failed upsert: ${error.message}`);
  }

  return rows.length;
}

interface BuildDailyLeadersContextOptions {
  query: string;
  leagueId: string;
  seasonId: string;
  myRosterPlayerIds?: number[];
}

export async function buildDailyLeadersContext(
  options: BuildDailyLeadersContextOptions
): Promise<string> {
  const { query, leagueId, seasonId, myRosterPlayerIds = [] } = options;
  const intent = parseIntent(query);
  if (!intent.enabled) return "";

  const targetDate = toDateOnly(intent.targetDate);
  const scoringPeriodId = await resolveScoringPeriodForDate(seasonId, targetDate);
  if (!scoringPeriodId) return "";

  try {
    await upsertDailyLeadersForDate({
      leagueId,
      seasonId,
      scoringPeriodId,
      periodDate: targetDate,
    });
  } catch (error) {
    console.warn("[Daily Leaders] Sync-on-read failed, falling back to stored rows.", error);
  }

  const supabase = createAdminClient();
  let queryBuilder = supabase
    .from("daily_leaders")
    .select("player_id,player_name,fantasy_points,ownership_percent,period_date,scoring_period_id")
    .eq("league_id", leagueId)
    .eq("season_id", seasonId)
    .eq("scoring_period_id", scoringPeriodId)
    .order("fantasy_points", { ascending: false, nullsFirst: false })
    .limit(30);

  if (intent.targetsMyTeam && myRosterPlayerIds.length > 0) {
    queryBuilder = queryBuilder.in("player_id", myRosterPlayerIds);
  }

  const { data, error } = await queryBuilder;
  if (error || !data || data.length === 0) return "";

  const rosterSet = new Set(myRosterPlayerIds.map((id) => Math.floor(id)));
  let rows = (data || []) as DailyLeaderQueryRow[];

  if (intent.targetsFreeAgents && rosterSet.size > 0) {
    rows = rows.filter((row) => !rosterSet.has(Math.floor(row.player_id)));
  }

  if (rows.length === 0) return "";

  const label = intent.targetsMyTeam
    ? "My Team Yesterday Performance"
    : intent.targetsFreeAgents
      ? "Top Free-Agent Performers Yesterday"
      : "Daily Leaders Yesterday";

  const formatted = rows
    .slice(0, 8)
    .map((row) => {
      const points = typeof row.fantasy_points === "number" ? row.fantasy_points.toFixed(2) : "n/a";
      const owned = typeof row.ownership_percent === "number" ? `${row.ownership_percent.toFixed(1)}% owned` : "ownership n/a";
      return `- ${row.player_name}: ${points} fpts (${owned})`;
    })
    .join("\n");

  return `${label} (date: ${targetDate}, scoring period: ${scoringPeriodId}):\n${formatted}`;
}
