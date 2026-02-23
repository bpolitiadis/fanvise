/**
 * Shared types used across all FanVise agents.
 *
 * These are the common return shapes that tools produce and that the
 * Supervisor and sub-agents understand. Keeping them here avoids circular
 * dependencies between agent packages.
 */

/** Intent categories the Supervisor routes on */
export type QueryIntent =
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
  isDropCandidate: boolean        // Low avg + few games + replaceable
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
