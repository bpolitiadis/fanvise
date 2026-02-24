/**
 * Optimizer Domain Types — Shared Client/Server
 *
 * This file MUST NOT import any server-only modules (LangGraph, Supabase, etc.)
 * so it can be safely bundled by Next.js for both server components and
 * client-side UI.
 *
 * The canonical computation lives in `src/services/optimizer.service.ts`;
 * these are the serialized shapes that cross the API boundary.
 */

/**
 * A single waiver-wire move recommendation produced by `LineupOptimizerGraph`.
 * Serializable as JSON — safe to embed in chat messages and stream tokens.
 */
export interface MoveRecommendation {
  /** Display rank (1 = best move) */
  rank: number;
  /** Player being dropped */
  dropPlayerName: string;
  /** Internal ESPN player ID for the drop candidate */
  dropPlayerId?: number;
  /** Player being added from waiver wire */
  addPlayerName: string;
  /** Internal ESPN player ID for the add candidate */
  addPlayerId?: number;
  /** Net projected fantasy point gain for the optimization window */
  netGain: number;
  /** Current roster's projected window FPTS without the move */
  baselineWindowFpts: number;
  /** Projected window FPTS after making the move */
  projectedWindowFpts: number;
  /** Reliability of this projection */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Risk flags (injury, limited schedule, low ownership) */
  warnings: string[];
  /** Drop score 0-100 (higher = more droppable) */
  dropScore: number;
  /** Stream score 0-100 (higher = better streaming candidate) */
  streamScore: number;
}

/**
 * The structured payload embedded in the `[[FV_MOVES:BASE64]]` stream token.
 * Decoded by the chat frontend to render MoveCard components.
 */
export interface MovesStreamPayload {
  moves: MoveRecommendation[];
  /** ISO timestamp of when the data was fetched — shown as freshness indicator */
  fetchedAt: string;
  /** The optimization window */
  windowStart: string;
  windowEnd: string;
}
