/**
 * Shared Tool Registry
 *
 * All LangGraph tools that can be used by any agent in the FanVise system.
 * Each tool is a thin, typed wrapper around an existing service.
 *
 * Design rules:
 * - Tools never import each other.
 * - Tools never contain business logic — they only fetch and format data.
 * - The LLM decides which tools to call; tools do exactly one thing.
 * - Every tool has a rich `description` so the LLM knows when to use it.
 *
 * @see docs/technical/Agentic_Architecture_LangGraph.md §7
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { EspnClient } from "@/lib/espn/client";
import { PlayerService } from "@/services/player.service";
import { buildIntelligenceSnapshot, fetchLeagueForTool } from "@/services/league.service";
import { searchNews, searchPlayerStatusSnapshots, fetchPlayerSpecificNews } from "@/services/news.service";
import { ScheduleService } from "@/services/schedule.service";
import { getPlayerGameLog } from "@/services/game-log.service";
import type { FreeAgentCandidate, MatchupSummary, RosterPlayerWithSchedule } from "./types";

// ─── ESPN environment (fallback when context leagueId not provided) ───────────
const DEFAULT_LEAGUE_ID = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID ?? "";
const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID!;
const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
const swid = process.env.ESPN_SWID;
const s2 = process.env.ESPN_S2;

// ─── Tool: get_espn_player_status ────────────────────────────────────────────

export const getEspnPlayerStatusTool = tool(
  async ({ playerName }: { playerName: string }) => {
    const client = new EspnClient(DEFAULT_LEAGUE_ID, seasonId, sport, swid, s2);
    const snapshots = await searchPlayerStatusSnapshots(playerName, 1);
    const snapshot = snapshots[0];

    if (snapshot?.player_id) {
      try {
        const card = await client.getPlayerCard(snapshot.player_id);
        const entry = (card?.players as Record<string, unknown>[])?.[0] as Record<string, unknown> | undefined;
        const player = entry?.player as Record<string, unknown> | undefined;
        const injuryDetails = player?.injuryDetails as Record<string, unknown> | undefined;

        const parts = injuryDetails?.expectedReturnDate as number[] | undefined;
        const expectedReturnDate =
          Array.isArray(parts) && parts.length >= 3
            ? `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`
            : snapshot.expected_return_date;

        return {
          playerId: snapshot.player_id,
          playerName: (player?.fullName as string) || snapshot.player_name,
          injuryStatus: (player?.injuryStatus as string) || snapshot.injury_status || "ACTIVE",
          injuryType: (injuryDetails?.type as string) || snapshot.injury_type || null,
          expectedReturnDate,
          isInjured: Boolean(player?.injured ?? snapshot.injured),
          lastNewsDate: snapshot.last_news_date,
          source: "ESPN_PLAYERCARD",
          fetchedAt: new Date().toISOString(),
        };
      } catch {
        // fall through to snapshot fallback
      }
    }

    if (snapshot) {
      return {
        playerId: snapshot.player_id,
        playerName: snapshot.player_name,
        injuryStatus: snapshot.injury_status || "ACTIVE",
        injuryType: snapshot.injury_type || null,
        expectedReturnDate: snapshot.expected_return_date,
        isInjured: Boolean(snapshot.injured),
        lastNewsDate: snapshot.last_news_date,
        source: "DB_SNAPSHOT",
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      playerId: null,
      playerName,
      injuryStatus: "UNKNOWN",
      injuryType: null,
      expectedReturnDate: null,
      isInjured: false,
      lastNewsDate: null,
      source: "NOT_FOUND",
      fetchedAt: new Date().toISOString(),
    };
  },
  {
    name: "get_espn_player_status",
    description:
      "Fetches live injury status and expected return date for a single NBA player from ESPN. " +
      "Returns: ACTIVE, GTD, OUT, DTD, QUESTIONABLE, SUSPENDED. " +
      "Call this first when a user asks about any player's health, availability, or whether to start/sit/drop them.",
    schema: z.object({
      playerName: z.string().describe("Full name of the NBA player, e.g. 'Ja Morant'"),
    }),
  }
);

// ─── Tool: get_player_news ────────────────────────────────────────────────────

export const getPlayerNewsTool = tool(
  async ({ playerName, limit = 8 }: { playerName: string; limit?: number }) => {
    const results = await searchNews(`${playerName} injury status news update`, limit);
    return (results as Record<string, unknown>[]).map((item) => {
      const body = (item.full_content as string) || (item.summary as string) || (item.content as string) || "";
      const excerptLen = item.full_content ? 600 : 300;
      return {
      title: (item.title as string) || null,
      summary: body.substring(0, excerptLen) + (body.length > excerptLen ? "…" : ""),
      publishedAt: (item.published_at as string) || null,
      source: (item.source as string) || null,
      injuryStatus: (item.injury_status as string) || null,
      sentiment: (item.sentiment as string) || null,
      trustLevel: typeof item.trust_level === "number" ? item.trust_level : null,
      url: (item.url as string) || null,
    };
    });
  },
  {
    name: "get_player_news",
    description:
      "Searches the FanVise news vector store for recent articles about a specific NBA player: " +
      "injury reports, practice updates, role changes, trade rumors. " +
      "Use after get_espn_player_status to get supporting context, coach quotes, and timeline details. " +
      "Also useful for free-agent research before committing to a pickup.",
    schema: z.object({
      playerName: z.string().describe("Full name of the NBA player"),
      limit: z.number().optional().default(8).describe("Max news items to return (default 8)"),
    }),
  }
);

/** Structured roster response so the LLM cannot confuse roster with free agents */
export interface GetMyRosterResult {
  teamName: string;
  source: "ESPN";
  roster: RosterPlayerWithSchedule[];
}

// ─── Tool: get_my_roster ──────────────────────────────────────────────────────

export const getMyRosterTool = tool(
  async ({
    teamId,
    leagueId: contextLeagueId,
  }: {
    teamId: string;
    leagueId?: string;
  }): Promise<GetMyRosterResult> => {
    const effectiveLeagueId = contextLeagueId?.trim() || DEFAULT_LEAGUE_ID;
    const snapshot = await buildIntelligenceSnapshot(effectiveLeagueId, teamId);
    const scheduleService = new ScheduleService();
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    weekEnd.setHours(23, 59, 59, 999);

    const gamesInWindow = await scheduleService.getGamesInRange(now, weekEnd);
    const teamIdsWithGames = new Set(
      gamesInWindow.flatMap((g) => [g.homeTeamId, g.awayTeamId]).map(String)
    );

    const roster = (snapshot.myTeam.roster ?? []).map((player) => {
      const proTeamId = player.proTeam;
      const playerGames = gamesInWindow.filter(
        (g) => String(g.homeTeamId) === proTeamId || String(g.awayTeamId) === proTeamId
      );
      const gameDates = playerGames
        .map((g) => g.date.substring(0, 10))
        .filter((d, i, arr) => arr.indexOf(d) === i);

      const isDropCandidate =
        (player.avgPoints ?? 0) < 20 &&
        gameDates.length <= 2 &&
        player.injuryStatus !== "ACTIVE";

      return {
        playerId: player.id,
        playerName: player.fullName,
        position: player.position,
        injuryStatus: player.injuryStatus,
        avgPoints: player.avgPoints ?? 0,
        totalPoints: player.totalPoints ?? 0,
        gamesPlayed: player.gamesPlayed ?? 0,
        gamesRemaining: teamIdsWithGames.has(proTeamId) ? gameDates.length : 0,
        gamesRemainingDates: gameDates,
        isDropCandidate,
      };
    });

    return {
      teamName: snapshot.myTeam.name,
      source: "ESPN",
      roster,
    };
  },
  {
    name: "get_my_roster",
    description:
      "Returns YOUR TEAM's roster from ESPN — players on your fantasy team only (NOT free agents). " +
      "Each player includes: avgPoints (PPG), totalPoints (season total), gamesPlayed (GP), gamesRemaining (this week), injuryStatus, isDropCandidate. " +
      "For 'totals' or 'season totals': use totalPoints (or avgPoints * gamesPlayed). Do NOT use avgPoints * gamesRemaining — that is a projection, not season total. " +
      "CRITICAL: Call this FIRST for team audits, roster overviews, or lineup questions. " +
      "Only players in the 'roster' array are on your team. Never list get_free_agents players as roster players.",
    schema: z.object({
      teamId: z.string().describe("The active fantasy team ID"),
    }),
  }
);

// ─── Tool: get_free_agents ────────────────────────────────────────────────────

export const getFreeAgentsTool = tool(
  async ({
    limit = 20,
    positionId,
    leagueId: contextLeagueId,
  }: {
    limit?: number;
    positionId?: number;
    leagueId?: string;
  }): Promise<FreeAgentCandidate[]> => {
    const effectiveLeagueId = contextLeagueId?.trim() || DEFAULT_LEAGUE_ID;
    const playerService = new PlayerService(effectiveLeagueId, seasonId, sport, swid, s2);
    const players = await playerService.getTopFreeAgents(limit, positionId);

    return players
      .filter((p) => p.injuryStatus !== "OUT" && !p.isInjured)
      .map((p) => ({
        playerId: p.id,
        playerName: p.fullName,
        position: p.position,
        injuryStatus: p.injuryStatus,
        avgPoints: p.avgPoints ?? 0,
        percentOwned: p.ownership?.percentOwned ?? 0,
        seasonOutlook: p.seasonOutlook ?? null,
      }));
  },
  {
    name: "get_free_agents",
    description:
      "Returns the top available free agents / waiver wire players, sorted by ownership percentage. " +
      "Filters out players who are currently OUT or injured. " +
      "Use this when the user asks about streamers, waiver pickups, or wants to compare roster additions.",
    schema: z.object({
      limit: z.number().optional().default(20).describe("Max number of free agents to return (default 20)"),
      positionId: z.number().optional().describe("ESPN position ID to filter by (1=PG, 2=SG, 3=SF, 4=PF, 5=C)"),
      leagueId: z.string().optional().describe("The ESPN league ID from [CONTEXT] — pass when available"),
    }),
  }
);

// ─── Tool: get_matchup_details ────────────────────────────────────────────────

export const getMatchupDetailsTool = tool(
  async ({
    teamId,
    leagueId: contextLeagueId,
  }: {
    teamId: string;
    leagueId?: string;
  }): Promise<MatchupSummary> => {
    const effectiveLeagueId = contextLeagueId?.trim() || DEFAULT_LEAGUE_ID;
    const snapshot = await buildIntelligenceSnapshot(effectiveLeagueId, teamId);
    const matchup = snapshot.matchup;
    const schedule = snapshot.schedule;

    return {
      myScore: matchup?.myScore ?? 0,
      opponentScore: matchup?.opponentScore ?? 0,
      differential: matchup?.differential ?? 0,
      myGamesRemaining: schedule?.myGamesRemaining ?? 0,
      opponentGamesRemaining: schedule?.opponentGamesRemaining ?? 0,
      scoringPeriod: matchup?.scoringPeriod ?? null,
    };
  },
  {
    name: "get_matchup_details",
    description:
      "Returns the current matchup score, point differential, and remaining games for both your team and your opponent. " +
      "Call this when the user asks about their matchup, whether they are winning/losing, or needs schedule volume context for streaming decisions.",
    schema: z.object({
      teamId: z.string().describe("The active fantasy team ID"),
      leagueId: z.string().optional().describe("The ESPN league ID from [CONTEXT] — pass when available"),
    }),
  }
);

// ─── Tool: search_news_by_topic ───────────────────────────────────────────────

export const searchNewsByTopicTool = tool(
  async ({ query, limit = 10 }: { query: string; limit?: number }) => {
    const results = await searchNews(query, limit);
    return (results as Record<string, unknown>[]).map((item) => ({
      title: (item.title as string) || null,
      summary: ((item.summary as string) || (item.content as string) || "").substring(0, 400),
      publishedAt: (item.published_at as string) || null,
      source: (item.source as string) || null,
      playerName: (item.player_name as string) || null,
      injuryStatus: (item.injury_status as string) || null,
      sentiment: (item.sentiment as string) || null,
      trustLevel: typeof item.trust_level === "number" ? item.trust_level : null,
      url: (item.url as string) || null,
    }));
  },
  {
    name: "search_news_by_topic",
    description:
      "Performs a semantic search across all FanVise news for any topic: league trends, position scarcity, injury waves, trade deadlines. " +
      "Unlike get_player_news (which is player-specific), this searches broadly. " +
      "Use for open-ended questions like 'who are the hottest waiver adds?' or 'any injury news this week?'",
    schema: z.object({
      query: z.string().describe("Natural language search query, e.g. 'centers with good schedules this week'"),
      limit: z.number().optional().default(10).describe("Max results to return"),
    }),
  }
);

// ─── Tool: get_player_game_log ────────────────────────────────────────────────

export const getPlayerGameLogTool = tool(
  async ({ playerName, lastNGames = 10 }: { playerName: string; lastNGames?: number }) => {
    const log = await getPlayerGameLog(playerName, lastNGames);
    if (!log) {
      return {
        found: false,
        playerName,
        message: `No game log data found for "${playerName}". The player may not be in the FanVise database yet.`,
      };
    }

    return {
      found: true,
      playerId: log.playerId,
      playerName: log.playerName,
      seasonId: log.seasonId,
      gamesReturned: log.lastNGames.length,
      averages: log.averages,
      recentGames: log.lastNGames.map((g) => ({
        scoringPeriodId: g.scoringPeriodId,
        gameDate: g.gameDate,
        fantasyPoints: g.fantasyPoints,
        pts: g.pts,
        reb: g.reb,
        ast: g.ast,
        stl: g.stl,
        blk: g.blk,
        turnovers: g.turnovers,
        three_pm: g.three_pm,
        fg: `${g.fg_made}/${g.fg_attempted} (${(g.fg_pct * 100).toFixed(1)}%)`,
        ft: `${g.ft_made}/${g.ft_attempted} (${(g.ft_pct * 100).toFixed(1)}%)`,
        minutes: g.minutes,
      })),
    };
  },
  {
    name: "get_player_game_log",
    description:
      "Fetches the last N individual game performances (stats per scoring period) for a single NBA player. " +
      "Returns: pts, reb, ast, stl, blk, turnovers, 3PM, FG%, FT%, minutes, and fantasy points for each game. " +
      "Also returns season-window averages across those games. " +
      "Use this when the user asks about a player's recent form, hot/cold streaks, consistency, or recent scoring trends. " +
      "Example triggers: 'how has X been playing?', 'is X worth starting?', 'show me X last 5 games', 'is X hot right now?'.",
    schema: z.object({
      playerName: z.string().describe("Full name of the NBA player, e.g. 'Nikola Jokic'"),
      lastNGames: z
        .number()
        .optional()
        .default(10)
        .describe("Number of most recent scoring periods to return (default 10, max 20)"),
    }),
  }
);

// ─── Tool: get_league_standings ───────────────────────────────────────────────

export const getLeagueStandingsTool = tool(
  async ({
    leagueId: toolLeagueId,
  }: {
    leagueId?: string;
  }) => {
    const effectiveLeagueId = toolLeagueId?.trim() || DEFAULT_LEAGUE_ID;
    const dbLeague = await fetchLeagueForTool(effectiveLeagueId);
    if (!dbLeague || !dbLeague.teams || dbLeague.teams.length === 0) {
      return {
        found: false,
        message: `No standings data found for league ${effectiveLeagueId}. The league may not be cached yet — try fetching roster first.`,
        standings: [],
      };
    }

    const standings = [...dbLeague.teams]
      .sort((a, b) => {
        const wDiff = (b.wins ?? 0) - (a.wins ?? 0);
        if (wDiff !== 0) return wDiff;
        return (a.losses ?? 0) - (b.losses ?? 0);
      })
      .map((team, idx) => ({
        rank: idx + 1,
        teamId: String(team.id),
        teamName: team.name,
        abbrev: team.abbrev,
        wins: team.wins ?? 0,
        losses: team.losses ?? 0,
        ties: team.ties ?? 0,
        isUserTeam: team.is_user_owned ?? false,
      }));

    return {
      found: true,
      leagueId: dbLeague.league_id,
      leagueName: dbLeague.name,
      season: dbLeague.season_id,
      standings,
    };
  },
  {
    name: "get_league_standings",
    description:
      "Returns the current league standings (win/loss record, rank) for every team in the fantasy league, sorted by wins. " +
      "Use this when the user asks about standings, playoff picture, who is in first place, or needs a league-wide context for trade/strategy decisions. " +
      "Also use when the user asks 'where am I in the standings?' or 'how does my record compare to others?'",
    schema: z.object({
      leagueId: z.string().optional().describe("The ESPN league ID from [CONTEXT] — REQUIRED for standings; pass when available"),
    }),
  }
);

// ─── Tool: refresh_player_news ────────────────────────────────────────────────

export const refreshPlayerNewsTool = tool(
  async ({ playerName }: { playerName: string }) => {
    console.log(`[Tool] refresh_player_news: fetching live news for "${playerName}"`);
    const { refreshed, items } = await fetchPlayerSpecificNews(playerName);

    if (items.length === 0) {
      return {
        refreshed,
        found: false,
        message: `No recent news articles found for "${playerName}" across live feeds. Rely on ESPN status data only.`,
        articles: [],
      };
    }

    return {
      refreshed,
      found: true,
      message: `Fetched ${refreshed} new article(s) and found ${items.length} total item(s) for ${playerName}.`,
      articles: items.map((item) => ({
        title: item.title ?? null,
        summary: (item.summary ?? item.content ?? "").substring(0, 400),
        source: item.source ?? null,
        publishedAt: item.published_at ?? null,
        injuryStatus: item.injury_status ?? null,
        sentiment: item.sentiment ?? null,
        isInjuryReport: item.is_injury_report ?? false,
        trustLevel: item.trust_level ?? null,
        url: item.url ?? null,
      })),
    };
  },
  {
    name: "refresh_player_news",
    description:
      "Fetches LIVE, player-specific news directly from Rotowire, ESPN, Yahoo, CBS Sports and RealGM RSS feeds right now, " +
      "ingests any new articles into the FanVise database, and returns the latest results. " +
      "Use this when: (1) get_player_news returned empty or stale results (no items from the last 24 h), " +
      "(2) the user explicitly asks for 'latest' or 'breaking' news about a player, or " +
      "(3) you are about to make a start/sit/drop recommendation for a player with a non-ACTIVE status and need to verify their current timeline. " +
      "Do NOT call this for every query — only when freshness is critical.",
    schema: z.object({
      playerName: z.string().describe("Full name of the NBA player, e.g. 'Devin Booker'"),
    }),
  }
);

// ─── Tool: get_league_scoreboard ─────────────────────────────────────────────

export const getLeagueScoreboardTool = tool(
  async ({ matchupPeriod }: { matchupPeriod?: number }) => {
    const client = new EspnClient(DEFAULT_LEAGUE_ID, seasonId, sport, swid, s2);
    const matchupData = await client.getMatchups(undefined, ["mMatchupScore", "mScoreboard"]);

    if (!matchupData?.schedule) {
      return { found: false, message: "No schedule data available from ESPN.", matchups: [] };
    }

    const currentPeriod: number =
      matchupPeriod ??
      matchupData.status?.currentMatchupPeriod ??
      matchupData.scoringPeriodId ??
      1;

    const getTeamName = (teamId: number): string => {
      const teams = (matchupData.teams as Record<string, unknown>[]) ?? [];
      const team = teams.find((t) => (t as Record<string, unknown>).id === teamId) as
        | Record<string, unknown>
        | undefined;
      if (!team) return `Team ${teamId}`;
      const loc = (team.location as string) ?? "";
      const nick = (team.nickname as string) ?? "";
      return loc && nick ? `${loc} ${nick}` : (team.name as string) ?? `Team ${teamId}`;
    };

    interface EspnMatchup {
      home?: { teamId?: number; totalPoints?: number };
      away?: { teamId?: number; totalPoints?: number };
      matchupPeriodId?: number;
      winner?: string;
    }

    const periodMatchups = ((matchupData.schedule as EspnMatchup[]) ?? []).filter(
      (m) => m.matchupPeriodId === currentPeriod
    );

    if (periodMatchups.length === 0) {
      return {
        found: false,
        message: `No matchups found for period ${currentPeriod}.`,
        matchups: [],
      };
    }

    return {
      found: true,
      matchupPeriod: currentPeriod,
      matchups: periodMatchups.map((m) => {
        const homeScore = Math.round((m.home?.totalPoints ?? 0) * 100) / 100;
        const awayScore = Math.round((m.away?.totalPoints ?? 0) * 100) / 100;
        return {
          homeTeam: getTeamName(m.home?.teamId ?? 0),
          homeScore,
          awayTeam: getTeamName(m.away?.teamId ?? 0),
          awayScore,
          leader: homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "tied",
          pointDifferential: Math.round(Math.abs(homeScore - awayScore) * 100) / 100,
          status: m.winner === "UNDECIDED" ? "in_progress" : "completed",
        };
      }),
    };
  },
  {
    name: "get_league_scoreboard",
    description:
      "Returns every matchup score across the entire league for the current (or a given) matchup period. " +
      "Shows home/away team names, scores, who is leading, and point differential for each matchup. " +
      "Use this when the user asks: 'how is everyone doing this week?', 'who has the toughest matchup?', " +
      "'who is winning/losing in the league?', 'what matchups are closest?', or needs a full league-wide scoreboard overview.",
    schema: z.object({
      matchupPeriod: z
        .number()
        .optional()
        .describe("Matchup period (week number) to fetch — defaults to current week"),
    }),
  }
);

// ─── Tool: get_league_activity ────────────────────────────────────────────────

export const getLeagueActivityTool = tool(
  async ({ size = 15, type }: { size?: number; type?: string }) => {
    const client = new EspnClient(DEFAULT_LEAGUE_ID, seasonId, sport, swid, s2);
    const [transData, dbLeague] = await Promise.all([
      client.getTransactions(),
      fetchLeagueForTool(DEFAULT_LEAGUE_ID),
    ]);

    const transactions: Record<string, unknown>[] = Array.isArray(transData?.transactions)
      ? (transData.transactions as Record<string, unknown>[])
      : [];

    const teamMap = new Map(
      (dbLeague?.teams ?? []).map((t) => [Number(t.id), t.name ?? t.abbrev ?? `Team ${t.id}`])
    );

    const TYPE_LABEL: Record<string, string> = {
      WAIVER: "WAIVER PICKUP",
      FREEAGENT: "FA PICKUP",
      TRADE_ACCEPT: "TRADE",
    };

    const typeKey = type?.toUpperCase();
    const typeFilterKeys: string[] | null =
      typeKey === "TRADE"
        ? ["TRADE_ACCEPT"]
        : typeKey === "WAIVER"
          ? ["WAIVER"]
          : typeKey === "FA"
            ? ["FREEAGENT"]
            : null;

    return transactions
      .filter((t) => {
        if (t.status !== "EXECUTED") return false;
        if (!["WAIVER", "FREEAGENT", "TRADE_ACCEPT"].includes(t.type as string)) return false;
        if (typeFilterKeys && !typeFilterKeys.includes(t.type as string)) return false;
        return true;
      })
      .sort((a, b) => (b.processDate as number) - (a.processDate as number))
      .slice(0, size)
      .map((t) => {
        const items = (t.items as Record<string, unknown>[]) ?? [];
        const resolveName = (item: Record<string, unknown>): string => {
          const entry = item.playerPoolEntry as Record<string, unknown> | undefined;
          const player = entry?.player as Record<string, unknown> | undefined;
          return (player?.fullName as string) ?? "Unknown Player";
        };
        return {
          date: new Date(t.processDate as number).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          team: teamMap.get(t.teamId as number) ?? `Team ${t.teamId}`,
          action: TYPE_LABEL[t.type as string] ?? String(t.type),
          added: items.filter((i) => i.type === "ADD").map(resolveName),
          dropped: items.filter((i) => i.type === "DROP").map(resolveName),
        };
      });
  },
  {
    name: "get_league_activity",
    description:
      "Returns recent transaction activity across the whole league: who picked up or dropped players, and any completed trades. " +
      "Shows team name, date, action type (FA PICKUP / WAIVER PICKUP / TRADE), and the players added/dropped. " +
      "Use this when the user asks: 'who got dropped recently?', 'what happened on the waiver wire?', " +
      "'who is everyone picking up?', 'what trades happened?', 'who did [team] add or drop?', or 'is [player] available?'.",
    schema: z.object({
      size: z
        .number()
        .optional()
        .default(15)
        .describe("Max number of transactions to return (default 15)"),
      type: z
        .string()
        .optional()
        .describe("Filter by transaction type: 'WAIVER', 'FA', or 'TRADE'. Omit for all types."),
    }),
  }
);

// ─── Tool: get_team_season_stats ──────────────────────────────────────────────

export const getTeamSeasonStatsTool = tool(
  async () => {
    const client = new EspnClient(DEFAULT_LEAGUE_ID, seasonId, sport, swid, s2);
    const data = await client.getLeagueSettings();
    const teams: Record<string, unknown>[] = Array.isArray(data?.teams) ? data.teams : [];

    return teams
      .map((t) => {
        const record = ((t.record as Record<string, unknown>)?.overall ?? {}) as Record<
          string,
          number
        >;
        const txCounter = (t.transactionCounter ?? {}) as Record<string, number>;
        const loc = (t.location as string) ?? "";
        const nick = (t.nickname as string) ?? "";
        const name = loc && nick ? `${loc} ${nick}` : (t.name as string) ?? `Team ${t.id}`;

        return {
          teamId: String(t.id),
          teamName: name,
          abbrev: (t.abbrev as string) ?? "",
          wins: record.wins ?? 0,
          losses: record.losses ?? 0,
          ties: record.ties ?? 0,
          pointsFor: Math.round((record.pointsFor ?? 0) * 100) / 100,
          pointsAgainst: Math.round((record.pointsAgainst ?? 0) * 100) / 100,
          pointDifferential:
            Math.round(((record.pointsFor ?? 0) - (record.pointsAgainst ?? 0)) * 100) / 100,
          acquisitions: txCounter.acquisitions ?? 0,
          drops: txCounter.drops ?? 0,
          trades: txCounter.trades ?? 0,
          acquisitionBudgetSpent: txCounter.acquisitionBudgetSpent ?? 0,
        };
      })
      .sort((a, b) => b.pointsFor - a.pointsFor);
  },
  {
    name: "get_team_season_stats",
    description:
      "Returns season-aggregate stats for every team in the league: total points scored (PF), points allowed (PA), " +
      "point differential, win/loss record, and waiver-wire activity counts (acquisitions, drops, trades). " +
      "Sorted by points scored (highest first). " +
      "Use this when the user asks: 'who is the highest-scoring team?', 'who has been most active on the wire?', " +
      "'compare team strengths for a trade', 'who has the best/worst point differential?', or any question about season-level team performance.",
    schema: z.object({}),
  }
);

// ─── Registry export ──────────────────────────────────────────────────────────

/** All tools available to the Supervisor and sub-agents */
export const ALL_TOOLS = [
  getEspnPlayerStatusTool,
  getPlayerNewsTool,
  refreshPlayerNewsTool,
  getPlayerGameLogTool,
  getMyRosterTool,
  getFreeAgentsTool,
  getMatchupDetailsTool,
  getLeagueStandingsTool,
  searchNewsByTopicTool,
  getLeagueScoreboardTool,
  getLeagueActivityTool,
  getTeamSeasonStatsTool,
] as const;

export type FanviseToolName =
  | "get_espn_player_status"
  | "get_player_news"
  | "refresh_player_news"
  | "get_player_game_log"
  | "get_my_roster"
  | "get_free_agents"
  | "get_matchup_details"
  | "get_league_standings"
  | "search_news_by_topic"
  | "get_league_scoreboard"
  | "get_league_activity"
  | "get_team_season_stats";
