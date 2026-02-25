/**
 * Lineup Optimizer Graph — State Definition
 *
 * State flows through 6 nodes:
 *   parse_window → gather_data → score_candidates → simulate_moves → rank_moves → compose_recommendation
 *
 * The first 5 nodes are pure TypeScript (no LLM).
 * Only `compose_recommendation` calls the LLM.
 *
 * All data is accumulated in state and passed forward read-only.
 */

import { Annotation } from "@langchain/langgraph";
import type { NbaGame } from "@/services/optimizer.service";
import type { DropScore, StreamScore, SimulateMoveResult } from "@/services/optimizer.service";
import type { MoveRecommendation } from "@/types/optimizer";
import { getCurrentMatchupWindow } from "@/lib/time/matchup-window";

// Re-export for graph-internal use
export type { MoveRecommendation as RankedMove };

/** A roster player shape used inside the optimizer graph */
export interface GraphRosterPlayer {
  playerId: number;
  playerName: string;
  position: string;
  eligibleSlots: string[];
  proTeamId: number;
  injuryStatus: string;
  avgFpts: number;
  totalFpts: number;
  gamesPlayed: number;
}

/** A free agent shape used inside the optimizer graph */
export interface GraphFreeAgent {
  playerId: number;
  playerName: string;
  position: string;
  eligibleSlots: string[];
  proTeamId: number;
  injuryStatus: string;
  avgFpts: number;
  percentOwned: number;
}

export const LineupOptimizerAnnotation = Annotation.Root({
  // ── Input ──────────────────────────────────────────────────────────────────

  teamId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  leagueId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  language: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "en",
  }),

  originalQuery: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  // ── Optimization Window ────────────────────────────────────────────────────

  windowStart: Annotation<string>({
    reducer: (_, next) => next,
    default: () => getCurrentMatchupWindow().start.toISOString(),
  }),

  windowEnd: Annotation<string>({
    reducer: (_, next) => next,
    default: () => getCurrentMatchupWindow().end.toISOString(),
  }),

  // ── Gathered Data ──────────────────────────────────────────────────────────

  roster: Annotation<GraphRosterPlayer[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  freeAgents: Annotation<GraphFreeAgent[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  matchupScore: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  opponentScore: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  gamesRemaining: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  rosterSlots: Annotation<Record<string, number>>({
    reducer: (_, next) => next,
    default: () => ({ PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, UTIL: 1, BE: 3 }),
  }),

  leagueAvgFpts: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 25,
  }),

  /** Pre-fetched schedule to avoid duplicate DB queries across nodes */
  preloadedGames: Annotation<NbaGame[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Scored Candidates ──────────────────────────────────────────────────────

  dropCandidates: Annotation<DropScore[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  streamCandidates: Annotation<StreamScore[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Simulation Results ─────────────────────────────────────────────────────

  simulatedMoves: Annotation<SimulateMoveResult[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  rankedMoves: Annotation<MoveRecommendation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Output ─────────────────────────────────────────────────────────────────

  recommendation: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});
