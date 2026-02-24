/**
 * OptimizerService — Deterministic Lineup Math Engine
 *
 * This service contains zero LLM calls. Every function is a pure calculation
 * that can be unit-tested with known inputs and expected outputs.
 *
 * Responsibilities:
 *  - Score players as drop candidates (league-relative, scoring-settings-aware)
 *  - Score free agents as streaming candidates (value × schedule volume)
 *  - Simulate a "drop A, add B" move and compute the net fantasy point delta
 *  - Build a valid daily lineup given roster slots and game schedule
 *  - Validate lineup legality for a given date
 *
 * The LLM in LineupOptimizerGraph calls these functions via tools and then
 * explains the results in natural language. It never performs the math.
 *
 * @module services/optimizer
 */

import { createAdminClient } from "@/utils/supabase/server";
import { ScheduleService, type NbaGame } from "@/services/schedule.service";

export type { NbaGame };

// ─── Types ────────────────────────────────────────────────────────────────────

/** Roster slot configuration keyed by ESPN slot name */
export type RosterSlots = Record<string, number>;

/** Scoring weights keyed by stat name or ESPN stat ID */
export type ScoringWeights = Record<string, number>;

/** A player on the user's active roster */
export interface RosterPlayer {
  playerId: number;
  playerName: string;
  /** Primary fantasy position label (e.g. "PG", "SG/SF", "C") */
  position: string;
  /** All eligible lineup slots for this player */
  eligibleSlots: string[];
  proTeamId: number;
  injuryStatus: string;
  /** Season average fantasy points per game */
  avgFpts: number;
  /** Total fantasy points scored this season */
  totalFpts: number;
  gamesPlayed: number;
}

/** A player available on the waiver wire */
export interface FreeAgentPlayer {
  playerId: number;
  playerName: string;
  position: string;
  eligibleSlots: string[];
  proTeamId: number;
  injuryStatus: string;
  avgFpts: number;
  percentOwned: number;
}

/** Output from scoring a roster player as a potential drop */
export interface DropScore {
  playerId: number;
  playerName: string;
  score: number;            // 0–100: higher = better drop candidate
  gamesRemaining: number;   // games in the current optimization window
  projectedWindowFpts: number; // avgFpts × gamesRemaining
  reasons: string[];        // human-readable factors that raised the score
}

/** Output from scoring a free agent as a potential stream addition */
export interface StreamScore {
  playerId: number;
  playerName: string;
  score: number;            // 0–100: higher = better streamer
  gamesRemaining: number;
  gameDates: string[];       // ISO dates of remaining games
  projectedWindowFpts: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

/** A single slot assignment for a daily lineup */
export interface SlotAssignment {
  slot: string;             // e.g., "PG", "G", "UTIL", "BE"
  playerId: number;
  playerName: string;
  isStarting: boolean;
}

/** Result of simulating a single drop/add move */
export interface SimulateMoveResult {
  isLegal: boolean;
  dropPlayerId: number;
  dropPlayerName: string;
  addPlayerId: number;
  addPlayerName: string;
  /** Expected points WITHOUT this move (baseline) */
  baselineWindowFpts: number;
  /** Expected points WITH this move applied */
  projectedWindowFpts: number;
  netGain: number;
  dailyBreakdown: { date: string; slotsUsed: string[] }[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  warnings: string[];
}

/** Complete result from a full optimization pass */
export interface OptimizationResult {
  windowStart: string;
  windowEnd: string;
  moves: SimulateMoveResult[];
  topMove: SimulateMoveResult | null;
  message: string;
}

/** Input for lineup legality validation */
export interface ValidateLineupInput {
  roster: { playerId: number; playerName: string; eligibleSlots: string[] }[];
  rosterSlots: RosterSlots;
  playingPlayerIds: number[]; // players whose NBA team plays on this date
}

/** Result of validating lineup legality */
export interface ValidateLineupResult {
  isLegal: boolean;
  assignments: SlotAssignment[];
  unfilledStartingSlots: string[];
  benchedWithGames: string[]; // players who have a game but couldn't start
  warnings: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum avg fpts for a player to be considered "starta-worthy" */
const START_WORTHY_THRESHOLD = 15;

/** Positional slot hierarchy: each slot accepts these eligible slot codes.
 *  ESPN uses numeric slot IDs internally; these are the canonical string labels.
 */
const SLOT_HIERARCHY: Record<string, string[]> = {
  PG:   ["PG"],
  SG:   ["SG"],
  SF:   ["SF"],
  PF:   ["PF"],
  C:    ["C"],
  G:    ["PG", "SG"],
  F:    ["SF", "PF"],
  GF:   ["PG", "SG", "SF", "PF"],
  FC:   ["SF", "PF", "C"],
  UTIL: ["PG", "SG", "SF", "PF", "C"],
  BE:   ["PG", "SG", "SF", "PF", "C"],   // bench
  IR:   ["IR"],
};

// ─── Core Utilities ───────────────────────────────────────────────────────────

/**
 * Given a player's eligible slot codes and a slot definition, returns true
 * if the player can legally occupy that slot.
 */
function canFillSlot(eligibleSlots: string[], slotName: string): boolean {
  const acceptedPositions = SLOT_HIERARCHY[slotName] ?? [slotName];
  return eligibleSlots.some((p) => acceptedPositions.includes(p));
}

/**
 * Computes a confidence tier from sample size and injury status.
 */
function computeConfidence(
  gamesPlayed: number,
  injuryStatus: string
): "HIGH" | "MEDIUM" | "LOW" {
  if (injuryStatus === "DTD" || injuryStatus === "GTD" || injuryStatus === "QUESTIONABLE") {
    return "LOW";
  }
  if (gamesPlayed >= 15) return "HIGH";
  if (gamesPlayed >= 7) return "MEDIUM";
  return "LOW";
}

/**
 * Returns the end of the current fantasy week (Sunday 23:59:59 local).
 */
function currentWeekEnd(): Date {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + (7 - now.getDay()));
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

// ─── Public Service Functions ─────────────────────────────────────────────────

/**
 * Scores a roster player as a drop candidate.
 *
 * The score is league-relative: if the player's projected window contribution
 * is below what the typical available free agent provides, they become droppable.
 *
 * @param player - The roster player to evaluate
 * @param windowStart - Start of the optimization window (defaults to now)
 * @param windowEnd - End of the optimization window (defaults to end of week)
 * @param leagueAvgFpts - Average fantasy PPG in this league (for relative scoring)
 * @param preloadedGames - Optional pre-fetched schedule to avoid duplicate DB queries
 * @returns DropScore with 0-100 score (higher = more droppable)
 */
export async function scoreDroppingCandidate(
  player: RosterPlayer,
  windowStart?: Date,
  windowEnd?: Date,
  leagueAvgFpts = 25,
  preloadedGames?: NbaGame[]
): Promise<DropScore> {
  const start = windowStart ?? new Date();
  const end = windowEnd ?? currentWeekEnd();

  const games =
    preloadedGames ?? await new ScheduleService().getGamesInRange(start, end);

  const playerGames = games.filter(
    (g) =>
      g.homeTeamId === player.proTeamId || g.awayTeamId === player.proTeamId
  );
  const gameDates = [
    ...new Set(playerGames.map((g) => g.date.substring(0, 10))),
  ];
  const gamesRemaining = gameDates.length;
  const projectedWindowFpts = player.avgFpts * gamesRemaining;

  const reasons: string[] = [];
  let score = 0;

  // Low avg fpts vs league average → significant drop signal
  if (player.avgFpts < leagueAvgFpts * 0.6) {
    score += 40;
    reasons.push(`Avg ${player.avgFpts.toFixed(1)} fpts is well below league avg (${leagueAvgFpts})`);
  } else if (player.avgFpts < leagueAvgFpts * 0.8) {
    score += 20;
    reasons.push(`Avg ${player.avgFpts.toFixed(1)} fpts is below league avg (${leagueAvgFpts})`);
  }

  // Sparse schedule in the window
  if (gamesRemaining === 0) {
    score += 40;
    reasons.push("No games remaining in the optimization window");
  } else if (gamesRemaining === 1) {
    score += 20;
    reasons.push("Only 1 game remaining in the optimization window");
  }

  // Injury uncertainty
  if (player.injuryStatus === "OUT") {
    score += 30;
    reasons.push("Player is currently OUT");
  } else if (["DTD", "GTD", "QUESTIONABLE"].includes(player.injuryStatus)) {
    score += 15;
    reasons.push(`Injury uncertainty: ${player.injuryStatus}`);
  }

  // Small sample (unreliable avg)
  if (player.gamesPlayed < 5) {
    score += 10;
    reasons.push(`Low sample size: only ${player.gamesPlayed} games played`);
  }

  return {
    playerId: player.playerId,
    playerName: player.playerName,
    score: Math.min(score, 100),
    gamesRemaining,
    projectedWindowFpts,
    reasons,
  };
}

/**
 * Scores a free agent as a streaming candidate.
 *
 * Primary signal: avgFpts × gamesRemaining in the window (volume-adjusted value).
 * Secondary signal: injury status confidence tier.
 *
 * @param freeAgent - The free agent to evaluate
 * @param windowStart - Start of the optimization window
 * @param windowEnd - End of the optimization window
 * @param preloadedGames - Optional pre-fetched schedule to avoid duplicate DB queries
 * @returns StreamScore with projected window contribution and confidence
 */
export async function scoreStreamingCandidate(
  freeAgent: FreeAgentPlayer,
  windowStart?: Date,
  windowEnd?: Date,
  preloadedGames?: NbaGame[]
): Promise<StreamScore> {
  const start = windowStart ?? new Date();
  const end = windowEnd ?? currentWeekEnd();

  const games =
    preloadedGames ?? await new ScheduleService().getGamesInRange(start, end);

  const playerGames = games.filter(
    (g) =>
      g.homeTeamId === freeAgent.proTeamId ||
      g.awayTeamId === freeAgent.proTeamId
  );
  const gameDates = [
    ...new Set(playerGames.map((g) => g.date.substring(0, 10))),
  ].sort();
  const gamesRemaining = gameDates.length;
  const projectedWindowFpts = freeAgent.avgFpts * gamesRemaining;

  // Normalize to 0-100: project against a 3-game / 30-fpts baseline
  const maxScore = 3 * 30;
  const rawScore = Math.min(projectedWindowFpts, maxScore);
  const score = Math.round((rawScore / maxScore) * 100);

  const confidence = computeConfidence(
    Math.round(freeAgent.avgFpts > 0 ? freeAgent.avgFpts : 0),
    freeAgent.injuryStatus
  );

  return {
    playerId: freeAgent.playerId,
    playerName: freeAgent.playerName,
    score,
    gamesRemaining,
    gameDates,
    projectedWindowFpts,
    confidence,
  };
}

/**
 * Builds the best legal starting lineup for a given date.
 *
 * Uses a greedy slot-fill algorithm: assigns the highest-avgFpts eligible
 * player to each starting slot in order of slot specificity.
 *
 * @param roster - All players currently on the roster
 * @param rosterSlots - Slot configuration from league settings
 * @param gameDate - The date to build the lineup for
 * @param playingProTeamIds - Set of NBA team IDs that play on this date
 * @returns Ordered slot assignments with starting/bench flags
 */
export function buildDailyLineup(
  roster: RosterPlayer[],
  rosterSlots: RosterSlots,
  gameDate: string,
  playingProTeamIds: Set<number>
): SlotAssignment[] {
  // Players who have a game on this date and are not OUT
  const available = roster.filter(
    (p) =>
      playingProTeamIds.has(p.proTeamId) &&
      p.injuryStatus !== "OUT" &&
      p.injuryStatus !== "IR"
  );

  // Sort available players by avg fpts descending (best first)
  const sorted = [...available].sort((a, b) => b.avgFpts - a.avgFpts);

  const assignments: SlotAssignment[] = [];
  const assignedPlayerIds = new Set<number>();

  // Starting slots (everything except BE and IR)
  const startingSlotEntries = Object.entries(rosterSlots).filter(
    ([slot, count]) => slot !== "BE" && slot !== "IR" && count > 0
  );

  // Sort starting slots: specific slots (PG, SG, etc.) before flex slots (G, UTIL)
  const slotSpecificity = (slot: string): number => {
    const flex = ["UTIL", "GF", "FC", "G", "F"];
    return flex.includes(slot) ? 1 : 0;
  };
  startingSlotEntries.sort(([a], [b]) => slotSpecificity(a) - slotSpecificity(b));

  for (const [slot, count] of startingSlotEntries) {
    let filled = 0;
    for (const player of sorted) {
      if (filled >= count) break;
      if (assignedPlayerIds.has(player.playerId)) continue;
      if (!canFillSlot(player.eligibleSlots, slot)) continue;

      assignments.push({
        slot,
        playerId: player.playerId,
        playerName: player.playerName,
        isStarting: true,
      });
      assignedPlayerIds.add(player.playerId);
      filled++;
    }
  }

  // Remaining players go to bench
  const benchCount = rosterSlots["BE"] ?? 0;
  let benchFilled = 0;
  for (const player of roster) {
    if (benchFilled >= benchCount) break;
    if (assignedPlayerIds.has(player.playerId)) continue;
    assignments.push({
      slot: "BE",
      playerId: player.playerId,
      playerName: player.playerName,
      isStarting: false,
    });
    assignedPlayerIds.add(player.playerId);
    benchFilled++;
  }

  return assignments;
}

/**
 * Validates whether a given roster can produce a legally filled starting lineup
 * on a specific date.
 *
 * Returns the assignments, any unfilled starting slots, and players benched
 * despite having a game (wasted starts).
 */
export function validateLineupLegality(
  input: ValidateLineupInput
): ValidateLineupResult {
  const { roster, rosterSlots, playingPlayerIds } = input;
  const playingSet = new Set(playingPlayerIds);

  const playingRoster = roster.filter((p) => playingSet.has(p.playerId));
  const assignments: SlotAssignment[] = [];
  const assignedPlayerIds = new Set<number>();
  const unfilledStartingSlots: string[] = [];
  const warnings: string[] = [];

  const startingSlotEntries = Object.entries(rosterSlots).filter(
    ([slot, count]) => slot !== "BE" && slot !== "IR" && count > 0
  );

  const slotSpecificity = (slot: string): number =>
    ["UTIL", "GF", "FC", "G", "F"].includes(slot) ? 1 : 0;

  startingSlotEntries.sort(([a], [b]) => slotSpecificity(a) - slotSpecificity(b));

  for (const [slot, count] of startingSlotEntries) {
    let filled = 0;
    for (const player of playingRoster) {
      if (filled >= count) break;
      if (assignedPlayerIds.has(player.playerId)) continue;
      if (!canFillSlot(player.eligibleSlots, slot)) continue;

      assignments.push({
        slot,
        playerId: player.playerId,
        playerName: player.playerName,
        isStarting: true,
      });
      assignedPlayerIds.add(player.playerId);
      filled++;
    }
    for (let i = filled; i < count; i++) {
      unfilledStartingSlots.push(slot);
    }
  }

  // Players who have a game but couldn't be assigned a starting slot
  const benchedWithGames = playingRoster
    .filter((p) => !assignedPlayerIds.has(p.playerId))
    .map((p) => p.playerName);

  if (benchedWithGames.length > 0) {
    warnings.push(
      `${benchedWithGames.length} player(s) have a game but can't start due to slot constraints: ${benchedWithGames.join(", ")}`
    );
  }
  if (unfilledStartingSlots.length > 0) {
    warnings.push(
      `${unfilledStartingSlots.length} starting slot(s) could not be filled: ${unfilledStartingSlots.join(", ")}`
    );
  }

  return {
    isLegal: unfilledStartingSlots.length === 0,
    assignments,
    unfilledStartingSlots,
    benchedWithGames,
    warnings,
  };
}

/**
 * Simulates a single "drop player A, add free agent B" move.
 *
 * Computes:
 *  - Baseline window fpts (current roster, no move)
 *  - Projected window fpts (roster with drop/add applied)
 *  - Net gain (projected - baseline)
 *  - Whether the move produces a legal lineup every day in the window
 *
 * @param dropPlayer - The roster player being dropped
 * @param addPlayer - The free agent being added
 * @param currentRoster - The rest of the roster (excluding the drop player)
 * @param rosterSlots - League roster slot configuration
 * @param windowStart - Start of the optimization window
 * @param windowEnd - End of the optimization window
 * @param preloadedGames - Optional pre-fetched schedule to avoid duplicate DB queries
 */
export async function simulateMove(
  dropPlayer: RosterPlayer,
  addPlayer: FreeAgentPlayer,
  currentRoster: RosterPlayer[],
  rosterSlots: RosterSlots,
  windowStart?: Date,
  windowEnd?: Date,
  preloadedGames?: NbaGame[]
): Promise<SimulateMoveResult> {
  const start = windowStart ?? new Date();
  const end = windowEnd ?? currentWeekEnd();

  const allGames =
    preloadedGames ?? await new ScheduleService().getGamesInRange(start, end);

  // Collect all unique game dates in the window
  const allDates = [
    ...new Set(allGames.map((g) => g.date.substring(0, 10))),
  ].sort();

  const warnings: string[] = [];

  if (addPlayer.injuryStatus === "DTD" || addPlayer.injuryStatus === "GTD") {
    warnings.push(
      `${addPlayer.playerName} is ${addPlayer.injuryStatus} — game availability is uncertain`
    );
  }

  // Compute daily breakdowns
  const dailyBreakdown: SimulateMoveResult["dailyBreakdown"] = [];
  let baselineWindowFpts = 0;
  let projectedWindowFpts = 0;

  const rosterWithoutDrop = currentRoster.filter(
    (p) => p.playerId !== dropPlayer.playerId
  );

  // Synthesize the added free agent as a RosterPlayer for lineup simulation
  const addedAsRoster: RosterPlayer = {
    playerId: addPlayer.playerId,
    playerName: addPlayer.playerName,
    position: addPlayer.position,
    eligibleSlots: addPlayer.eligibleSlots,
    proTeamId: addPlayer.proTeamId,
    injuryStatus: addPlayer.injuryStatus,
    avgFpts: addPlayer.avgFpts,
    totalFpts: 0,
    gamesPlayed: 0,
  };

  for (const date of allDates) {
    // Use pre-loaded games filtered by date prefix — no extra DB call
    const dayGames = allGames.filter((g) => g.date.startsWith(date));
    const playingTeamIds = new Set(
      dayGames.flatMap((g) => [g.homeTeamId, g.awayTeamId])
    );

    // Baseline: lineup from current roster (including drop player)
    const baselineLineup = buildDailyLineup(
      currentRoster,
      rosterSlots,
      date,
      playingTeamIds
    );
    const baselineStarters = baselineLineup.filter((a) => a.isStarting);
    const baselineDayFpts = baselineStarters.reduce((sum, a) => {
      const player = currentRoster.find((p) => p.playerId === a.playerId);
      return sum + (player?.avgFpts ?? 0);
    }, 0);
    baselineWindowFpts += baselineDayFpts;

    // Projected: lineup with drop removed and add player inserted
    const projectedRoster = [...rosterWithoutDrop, addedAsRoster];
    const projectedLineup = buildDailyLineup(
      projectedRoster,
      rosterSlots,
      date,
      playingTeamIds
    );
    const projectedStarters = projectedLineup.filter((a) => a.isStarting);
    const projectedDayFpts = projectedStarters.reduce((sum, a) => {
      const player = projectedRoster.find((p) => p.playerId === a.playerId);
      return sum + (player?.avgFpts ?? 0);
    }, 0);
    projectedWindowFpts += projectedDayFpts;

    dailyBreakdown.push({
      date,
      slotsUsed: projectedStarters.map((a) => a.slot),
    });
  }

  const netGain = projectedWindowFpts - baselineWindowFpts;

  // Positional legality: check that the added player can fill at least one starting slot
  const isLegal = addPlayer.eligibleSlots.some((slot) =>
    Object.keys(rosterSlots).some(
      (s) => s !== "BE" && s !== "IR" && canFillSlot([slot], s)
    )
  );

  if (!isLegal) {
    warnings.push(
      `${addPlayer.playerName} has no eligible starting slot in this roster configuration`
    );
  }

  const confidence = computeConfidence(
    addPlayer.avgFpts > 0 ? 10 : 0,
    addPlayer.injuryStatus
  );

  return {
    isLegal,
    dropPlayerId: dropPlayer.playerId,
    dropPlayerName: dropPlayer.playerName,
    addPlayerId: addPlayer.playerId,
    addPlayerName: addPlayer.playerName,
    baselineWindowFpts: Math.round(baselineWindowFpts * 10) / 10,
    projectedWindowFpts: Math.round(projectedWindowFpts * 10) / 10,
    netGain: Math.round(netGain * 10) / 10,
    dailyBreakdown,
    confidence,
    warnings,
  };
}

/**
 * Fetches pre-calculated streaming candidate data from the v_streaming_candidates view.
 * Used by the streaming agent tools to avoid re-computing schedule joins.
 */
export async function getStreamingCandidatesFromView(
  limit = 30
): Promise<Array<{
  player_id: number;
  player_name: string;
  injury_status: string;
  avg_fpts: number;
  pct_owned: number;
  games_this_week: number;
  game_dates_this_week: string[];
}>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("v_streaming_candidates")
    .select(
      "player_id, player_name, injury_status, avg_fpts, pct_owned, games_this_week, game_dates_this_week"
    )
    .order("games_this_week", { ascending: false })
    .order("avg_fpts", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[OptimizerService] Error fetching streaming candidates:", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetches roster value stats from v_roster_value for a set of player IDs.
 * Gives the optimizer rolling 21-day performance context without a live ESPN call.
 */
export async function getRosterValueFromView(
  playerIds: number[]
): Promise<Array<{
  player_id: number;
  player_name: string;
  avg_fpts: number;
  fpts_volatility: number;
  recent_games: number;
  last_played: string | null;
}>> {
  if (playerIds.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("v_roster_value")
    .select("player_id, player_name, avg_fpts, fpts_volatility, recent_games, last_played")
    .in("player_id", playerIds);

  if (error) {
    console.error("[OptimizerService] Error fetching roster value:", error.message);
    return [];
  }

  return data ?? [];
}
