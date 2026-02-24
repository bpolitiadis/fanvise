/**
 * Deterministic Intent Classifier
 *
 * Replaces the LLM-based intent classification node in the Supervisor.
 * Saves 300-600ms of latency per request — every query was paying the
 * cost of a full Gemini round-trip just to get a category label.
 *
 * Design:
 * - Pure function — no async, no DB, no LLM.
 * - Ordered pattern matching: more specific intents are tested first.
 * - Falls back to "general_advice" when no pattern matches.
 *
 * Priority ordering rationale:
 *  1. matchup_analysis    — "matchup" keyword is unambiguous; checked first so
 *                           "stream to secure the win" in matchup context doesn't
 *                           accidentally trigger lineup_optimization or free_agent_scan
 *  2. lineup_optimization — explicit roster-transaction keywords (optim, start/sit,
 *                           drop/add). Bare "stream/streaming" is excluded to prevent
 *                           false positives; a query with both "optimize" and "streaming"
 *                           correctly triggers this via "optim" first.
 *  3. free_agent_scan     — waiver wire browsing, includes bare "stream/streaming" so
 *                           pure streaming queries ("streaming options", "best streamers")
 *                           land here after failing lineup_optimization patterns.
 *  4. player_research     — single-player status, injury, news
 *  5. general_advice      — fallback
 *
 * Tested directly in unit tests — no mocking required.
 *
 * @module agents/shared/intent-classifier
 */

import type { QueryIntent } from "./types";

// ─── Pattern map ──────────────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ intent: Exclude<QueryIntent, "general_advice">; pattern: RegExp }> = [
  // ── matchup_analysis (FIRST — "matchup" is a strong, unambiguous signal) ──
  // Current matchup score, opponent comparison
  {
    intent: "matchup_analysis",
    pattern:
      /\b(matchup|current score|am i winning|am i losing|how many points (do i|am i|are we)|points behind|catch up|my score|opponent score|this week.*score|score.*this week)\b/i,
  },

  // ── lineup_optimization ────────────────────────────────────────────────────
  // Explicit roster-transaction intent: drops, adds, start/sit decisions.
  // NOTE: bare "stream/streaming" is intentionally absent — those words appear
  //       in matchup and audit contexts and cause false positives. A query like
  //       "Optimize my lineup... streaming adds" hits "optim" here first;
  //       pure streaming queries like "streaming options this week" fall through
  //       to free_agent_scan which handles them correctly.
  {
    intent: "lineup_optimization",
    pattern:
      /\b(optim[a-z]+|set.*lineup|best.*lineup|lineup.*week|this week.*lineup|who.*should.*start|should.*i.*start|sit.*or.*start|start.*or.*sit|who.*to.*start|who.*do.*i.*start|drop.*add|add.*drop|my remaining games?|waiver.*add|waiver.*pickup|who.*can.*i.*drop|who.*should.*i.*drop|should.*i.*drop|who.*to.*drop|drop.*who|daily.*lineup|lineup.*help|roster.*decision)\b/i,
  },

  // ── free_agent_scan ────────────────────────────────────────────────────────
  // Browsing the waiver wire for available players.
  // Includes bare "stream/streaming" — pure streaming queries land here after
  // failing all lineup_optimization patterns (e.g. "streaming options this week",
  // "best streamers", "who should I stream tonight").
  {
    intent: "free_agent_scan",
    pattern:
      /\b(waiver wire|free agents?|best available|top available|who.*available|who.*pickup|who.*pick up|who.*grab|who.*to.*add|who.*add|best.*add|waivers|stream[a-z]*)\b/i,
  },

  // ── player_research ────────────────────────────────────────────────────────
  // Single-player status, injury, news, start/sit for one specific player
  {
    intent: "player_research",
    pattern:
      /\b(injur|injury|injured|hurt|gtd|dtd|day.to.day|game.time|expected.*return|return.*date|when.*back|out.*for|status.*of|news.*about|latest.*on|update.*on|report.*on|when.*return)\b/i,
  },
  {
    intent: "player_research",
    pattern:
      /\b(is .+ (playing|active|available|starting|healthy|going to play)|will .+ play|is .+ going to play)\b/i,
  },
  {
    intent: "player_research",
    pattern:
      /\b(how.*has .+ been|.+ last .+ game|.+ recent form|is .+ worth|.+ hot|.+ cold|.+ streak|game log|box score)\b/i,
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classifies a user's fantasy basketball query into one of five intents
 * using deterministic regex pattern matching.
 *
 * Pattern priority (first match wins):
 *  1. matchup_analysis    — current matchup/score context
 *  2. lineup_optimization — explicit roster transaction (drops/adds/start-sit)
 *  3. free_agent_scan     — waiver wire browsing (incl. bare stream/streaming)
 *  4. player_research     — single-player status, injury, news
 *  5. general_advice      — fallback
 *
 * @param query - The user's natural language question
 * @returns The resolved QueryIntent (never null)
 */
export function classifyIntent(query: string): QueryIntent {
  const normalized = query.trim().toLowerCase();

  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(normalized)) {
      return intent;
    }
  }

  return "general_advice";
}
