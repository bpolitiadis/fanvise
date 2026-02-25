import { EspnClient } from "@/lib/espn/client";
import { createAdminClient } from "@/utils/supabase/server";
import { loadEnv } from "./load-env";

loadEnv();

type PlayerSeed = {
  playerId: number;
  playerName: string;
  proTeamId: number | null;
};

const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || String(new Date().getFullYear());
const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
const swid = process.env.ESPN_SWID;
const s2 = process.env.ESPN_S2;

const PAGE_SIZE = 200;
const DEFAULT_LAST_N_PERIODS = 10;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_PAGES = 20;

const safeNum = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const buildLeagueUrl = (view: string) =>
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=${view}`;

const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    "User-Agent": "FanVise/1.0",
    "x-fantasy-platform": "espn-fantasy-web",
    "x-fantasy-source": "kona",
  };

  if (swid && s2) {
    headers.Cookie = `swid=${swid}; espn_s2=${s2};`;
  }

  return headers;
};

const fetchAllNbaPlayers = async (maxPages: number): Promise<PlayerSeed[]> => {
  if (!leagueId) {
    throw new Error("NEXT_PUBLIC_ESPN_LEAGUE_ID is required.");
  }

  const url = buildLeagueUrl("kona_player_info");
  const headersBase = getHeaders();
  const seen = new Map<number, PlayerSeed>();

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * PAGE_SIZE;
    const headers = { ...headersBase };
    headers["x-fantasy-filter"] = JSON.stringify({
      players: {
        filterStatus: { value: ["ONTEAM", "FREEAGENT", "WAIVERS"] },
        filterSlotIds: { value: [0] },
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        sortDraftRanks: { sortPriority: 2, sortAsc: true, value: "STANDARD" },
        limit: PAGE_SIZE,
        offset,
      },
    });

    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch player seed page ${page + 1}: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const players = Array.isArray(payload?.players) ? payload.players : [];
    if (players.length === 0) break;

    for (const entry of players) {
      const player = entry?.player;
      const playerId = typeof entry?.id === "number" ? entry.id : player?.id;
      if (typeof playerId !== "number" || !Number.isFinite(playerId)) continue;

      const name = typeof player?.fullName === "string" && player.fullName.trim()
        ? player.fullName.trim()
        : `Player ${playerId}`;
      const proTeamId = typeof player?.proTeamId === "number" ? player.proTeamId : null;
      seen.set(playerId, { playerId, playerName: name, proTeamId });
    }

    console.log(`[GameLogBackfill] Seed page ${page + 1}: ${players.length} players (unique=${seen.size})`);
    if (players.length < PAGE_SIZE) break;
  }

  return Array.from(seen.values());
};

const main = async () => {
  if (!leagueId) {
    throw new Error("NEXT_PUBLIC_ESPN_LEAGUE_ID is required.");
  }

  const lastNPeriods = Number(process.env.GAME_LOG_BACKFILL_LAST_N || DEFAULT_LAST_N_PERIODS);
  const batchSize = Number(process.env.GAME_LOG_BACKFILL_BATCH_SIZE || DEFAULT_BATCH_SIZE);
  const maxPages = Number(process.env.GAME_LOG_BACKFILL_MAX_PAGES || DEFAULT_MAX_PAGES);
  const nowIso = new Date().toISOString();

  const db = createAdminClient();
  const client = new EspnClient(leagueId, seasonId, sport, swid, s2);

  console.log(
    `[GameLogBackfill] Starting backfill (season=${seasonId}, lastN=${lastNPeriods}, batchSize=${batchSize}, maxPages=${maxPages})`
  );

  const players = await fetchAllNbaPlayers(maxPages);
  if (players.length === 0) {
    console.log("[GameLogBackfill] No players discovered, aborting.");
    return;
  }

  await db.from("player_status_snapshots").upsert(
    players.map((p) => ({
      player_id: p.playerId,
      player_name: p.playerName,
      pro_team_id: p.proTeamId,
      source: "espn_kona_player_info",
      last_synced_at: nowIso,
    })),
    { onConflict: "player_id" }
  );

  let upsertedRows = 0;
  const batches = chunk(players, Math.max(1, Math.floor(batchSize)));

  for (const [index, batch] of batches.entries()) {
    const ids = batch.map((p) => p.playerId);
    const logs = await client.getPlayerGameLog(ids, lastNPeriods);

    const allPeriodIds = Array.from(
      new Set(
        logs.flatMap((player) =>
          (player.stats || [])
            .map((s) => s.scoringPeriodId)
            .filter((periodId): periodId is number => typeof periodId === "number" && Number.isFinite(periodId))
        )
      )
    );

    const dateByPeriod = new Map<number, string>();
    if (allPeriodIds.length > 0) {
      const { data: scheduleRows } = await db
        .from("nba_schedule")
        .select("scoring_period_id, date")
        .eq("season_id", seasonId)
        .in("scoring_period_id", allPeriodIds);

      for (const row of scheduleRows ?? []) {
        const periodId = row.scoring_period_id as number;
        const date = typeof row.date === "string" ? row.date.split("T")[0] : null;
        if (date) dateByPeriod.set(periodId, date);
      }
    }

    const rows = logs.flatMap((player) => {
      const playerId = typeof player.playerId === "number" ? player.playerId : null;
      if (!playerId) return [];
      const playerName = typeof player.playerName === "string" && player.playerName.trim()
        ? player.playerName.trim()
        : `Player ${playerId}`;

      return (player.stats || []).map((s) => {
        const statsMap = s.stats ?? {};
        const get = (id: number) => safeNum(statsMap[String(id)]);
        const scoringPeriodId = safeNum(s.scoringPeriodId);
        return {
          player_id: playerId,
          player_name: playerName,
          season_id: seasonId,
          scoring_period_id: scoringPeriodId,
          game_date: dateByPeriod.get(scoringPeriodId) ?? null,
          pro_team_id: typeof player.proTeamId === "number" ? player.proTeamId : null,
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
          fetched_at: nowIso,
        };
      });
    });

    if (rows.length > 0) {
      const { error } = await db
        .from("player_game_logs")
        .upsert(rows, { onConflict: "player_id,season_id,scoring_period_id" });

      if (error) {
        throw new Error(`[GameLogBackfill] DB upsert failed: ${error.message}`);
      }
      upsertedRows += rows.length;
    }

    console.log(
      `[GameLogBackfill] Batch ${index + 1}/${batches.length}: players=${batch.length}, rows=${rows.length}, totalRows=${upsertedRows}`
    );
  }

  console.log(`[GameLogBackfill] Complete. Players=${players.length}, rowsUpserted=${upsertedRows}`);
};

main().catch((error) => {
  console.error("[GameLogBackfill] Failed:", error);
  process.exit(1);
});
