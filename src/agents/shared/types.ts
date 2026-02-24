/**
 * Shared types used across all FanVise agents.
 *
 * These are the common return shapes that tools produce and that the
 * Supervisor and sub-agents understand. Keeping them here avoids circular
 * dependencies between agent packages.
 */

/** Intent categories the Supervisor routes on */
export type QueryIntent =
  | "team_audit"           // Comprehensive roster overview: injuries, performers, streaming, standings
  | "player_research"      // Single or multi-player status/news lookup
  | "free_agent_scan"      // Browse + rank the waiver wire
  | "matchup_analysis"     // Compare my team vs opponent
  | "lineup_optimization"  // Full week plan: drops, adds, daily lineup
  | "general_advice"       // Everything else — falls back to classic RAG chat

/** Confidence tiers used across agents */
export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW"

/** Player recommendation after research */
export type PlayerRecommendation = "ACTIVE" | "MONITOR" | "HOLD" | "STREAM" | "DROP"

/** Structured free-agent candidate returned by the free-agent scan tool */
export interface FreeAgentCandidate {
  playerId: string
  playerName: string
  position: string
  injuryStatus: string
  avgPoints: number
  percentOwned: number
  seasonOutlook: string | null
}

/** A player from my roster with annotated schedule context */
export interface RosterPlayerWithSchedule {
  playerId: string
  playerName: string
  position: string
  injuryStatus: string
  avgPoints: number
  /** Season total fantasy points (avgPoints * gamesPlayed). Use this for "totals" or "season totals". */
  totalPoints: number
  /** Games played this season. avgPoints * gamesPlayed ≈ totalPoints */
  gamesPlayed: number
  gamesRemaining: number          // In the current matchup week
  gamesRemainingDates: string[]   // ISO dates of remaining games
  /**
   * Drop candidacy score (0–100). Higher = stronger drop signal.
   * League-relative: accounts for avg fpts vs league avg, schedule gaps, and injury status.
   * Replaces the old boolean `isDropCandidate`.
   */
  dropScore: number
  dropReasons: string[]           // Human-readable factors that raised the drop score
}

/** A free agent with schedule context for streaming decisions */
export interface FreeAgentWithSchedule {
  playerId: string
  playerName: string
  position: string
  injuryStatus: string
  avgPoints: number
  percentOwned: number
  seasonOutlook: string | null
  gamesRemaining: number          // In the current matchup week
  gamesRemainingDates: string[]   // ISO dates of remaining games
  /** Streaming score (0–100): avgPoints × gamesRemaining, normalized */
  streamScore: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
}

/** Result of a simulated drop/add move */
export interface SimulateMoveOutput {
  isLegal: boolean
  dropPlayerId: string
  dropPlayerName: string
  addPlayerId: string
  addPlayerName: string
  baselineWindowFpts: number
  projectedWindowFpts: number
  netGain: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
  warnings: string[]
  dailyBreakdown: { date: string; slotsUsed: string[] }[]
}

/** Matchup score summary */
export interface MatchupSummary {
  myScore: number
  opponentScore: number
  differential: number
  myGamesRemaining: number
  opponentGamesRemaining: number
  scoringPeriod: number | null
}
