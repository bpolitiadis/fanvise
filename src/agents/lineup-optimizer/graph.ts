/**
 * LineupOptimizerGraph — Phase 2 Core
 *
 * A LangGraph StateGraph with 6 nodes. Only the final node (`compose_recommendation`)
 * calls the LLM. All upstream nodes are pure TypeScript/service calls.
 *
 * Graph flow:
 *   __start__ → parse_window → gather_data → score_candidates
 *             → simulate_moves → rank_moves → compose_recommendation → END
 *
 * The "parallel execution" from Phase 2 spec is implemented inside `gather_data`
 * via Promise.all — a single node that fans out and waits.
 *
 * Latency target: <3s total for a typical optimization query.
 *   - parse_window:           <1ms   (pure computation)
 *   - gather_data:            ~800ms (3 parallel service calls)
 *   - score_candidates:       ~300ms (schedule filtering, no ESPN)
 *   - simulate_moves:         ~300ms (5 pairs, pre-loaded schedule)
 *   - rank_moves:             <1ms   (pure sort)
 *   - compose_recommendation: ~600ms (single focused LLM call)
 *
 * @see docs/technical/Lineup_Optimization_Flow.md § Phase 2
 */

import { StateGraph, END } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import {
  LineupOptimizerAnnotation,
  type GraphRosterPlayer,
  type GraphFreeAgent,
  type RankedMove,
} from "./state";
import { getOptimizerPrompt } from "@/prompts/agents/optimizer";
import {
  scoreDroppingCandidate,
  scoreStreamingCandidate,
  simulateMove,
  type RosterPlayer as OptimizerRosterPlayer,
  type FreeAgentPlayer as OptimizerFreeAgentPlayer,
} from "@/services/optimizer.service";
import { buildIntelligenceSnapshot, fetchLeagueForTool } from "@/services/league.service";
import { ScheduleService } from "@/services/schedule.service";
import { USE_LOCAL_AI, OLLAMA_BASE_URL } from "@/agents/shared/ai-config";
import type { SupportedLanguage } from "@/prompts/types";
import { getCurrentMatchupWindow } from "@/lib/time/matchup-window";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max drop candidates to evaluate — prevents combinatorial explosion */
const MAX_DROP_CANDIDATES = 3;

/** Max stream candidates to evaluate per drop candidate */
const MAX_STREAM_CANDIDATES = 5;

/** Minimum drop score to qualify as a drop candidate */
const DROP_SCORE_THRESHOLD = 30;

/** Minimum stream score to qualify as a streaming add */
const STREAM_SCORE_THRESHOLD = 10;

/** Maximum ranked moves to present to the user */
const MAX_RANKED_MOVES = 3;

const DEFAULT_ROSTER_SLOTS: Record<string, number> = {
  PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, UTIL: 1, BE: 3,
};

// ─── LLM (used only in compose_recommendation node) ──────────────────────────

const composeLlm = USE_LOCAL_AI
  ? new ChatOllama({
      model: process.env.OLLAMA_MODEL || "llama3.1",
      baseUrl: OLLAMA_BASE_URL,
      temperature: 0.2,
    })
  : new ChatGoogleGenerativeAI({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: 0.2,
    });

// ─── Helper: map Player (fantasy.ts) to optimizer RosterPlayer ───────────────

function toOptimizerPlayer(p: {
  id: string;
  fullName: string;
  position: string;
  proTeam: string;
  injuryStatus: string;
  avgPoints?: number;
  totalPoints?: number;
  gamesPlayed?: number;
}): GraphRosterPlayer {
  return {
    playerId: Number(p.id),
    playerName: p.fullName,
    position: p.position,
    eligibleSlots: [p.position],
    proTeamId: Number(p.proTeam),
    injuryStatus: p.injuryStatus ?? "ACTIVE",
    avgFpts: p.avgPoints ?? 0,
    totalFpts: p.totalPoints ?? 0,
    gamesPlayed: p.gamesPlayed ?? 0,
  };
}

function toOptimizerFreeAgent(p: {
  id: string;
  fullName: string;
  position: string;
  proTeam: string;
  injuryStatus: string;
  avgPoints?: number;
  ownership?: { percentOwned?: number };
  isInjured: boolean;
}): GraphFreeAgent | null {
  if (p.injuryStatus === "OUT" || p.isInjured) return null;
  return {
    playerId: Number(p.id),
    playerName: p.fullName,
    position: p.position,
    eligibleSlots: [p.position],
    proTeamId: Number(p.proTeam),
    injuryStatus: p.injuryStatus ?? "ACTIVE",
    avgFpts: p.avgPoints ?? 0,
    percentOwned: p.ownership?.percentOwned ?? 0,
  };
}

// ─── Node 1: parse_window ─────────────────────────────────────────────────────

const parseWindowNode = (
  state: typeof LineupOptimizerAnnotation.State
): Partial<typeof LineupOptimizerAnnotation.State> => {
  if (!state.teamId || !state.leagueId) {
    console.error("[Optimizer] parse_window: missing teamId or leagueId — aborting");
    return {
      error:
        "No active team or league context. Please select a team perspective in Settings before running lineup optimization.",
    };
  }

  const { start: windowStart, end: windowEnd } = getCurrentMatchupWindow();

  console.log(
    `[Optimizer] parse_window | team=${state.teamId} league=${state.leagueId} window=${windowStart.toISOString().slice(0, 10)} → ${windowEnd.toISOString().slice(0, 10)}`
  );

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
};

// ─── Node 2: gather_data ──────────────────────────────────────────────────────
// Single node that fans out into 3 parallel service calls then waits.
// Fetches schedule ONCE and stores it in state for downstream reuse.

const gatherDataNode = async (
  state: typeof LineupOptimizerAnnotation.State
): Promise<Partial<typeof LineupOptimizerAnnotation.State>> => {
  if (state.error) return {};

  const { teamId, leagueId, windowStart, windowEnd } = state;
  if (!teamId || !leagueId) return { error: "Missing teamId or leagueId in gather_data" };

  const windowStartDate = new Date(windowStart);
  const windowEndDate = new Date(windowEnd);
  const scheduleService = new ScheduleService();

  console.log(`[Optimizer] gather_data: fetching snapshot + schedule in parallel`);
  const t0 = Date.now();

  try {
    const [snapshot, dbLeague, preloadedGames] = await Promise.all([
      buildIntelligenceSnapshot(leagueId, teamId),
      fetchLeagueForTool(leagueId),
      scheduleService.getGamesInRange(windowStartDate, windowEndDate),
    ]);

    const rosterRaw = snapshot.myTeam.roster ?? [];
    const roster = rosterRaw.map(toOptimizerPlayer);

    const freeAgentsRaw = snapshot.freeAgents ?? [];
    const freeAgents = freeAgentsRaw
      .map(toOptimizerFreeAgent)
      .filter((p): p is GraphFreeAgent => p !== null);

    const rosterSlots =
      (dbLeague?.roster_settings as Record<string, number> | null) ??
      DEFAULT_ROSTER_SLOTS;

    // Approximate league avg from roster (stable proxy — real roster, known values)
    const validAvgs = roster.map((p) => p.avgFpts).filter((v) => v > 0);
    const leagueAvgFpts =
      validAvgs.length > 0
        ? validAvgs.reduce((s, v) => s + v, 0) / validAvgs.length
        : 25;

    console.log(
      `[Optimizer] gather_data done in ${Date.now() - t0}ms | roster=${roster.length} FA=${freeAgents.length} games=${preloadedGames.length} matchup=${snapshot.matchup?.myScore ?? "?"}-${snapshot.matchup?.opponentScore ?? "?"}`
    );

    return {
      roster,
      freeAgents,
      matchupScore: snapshot.matchup?.myScore ?? null,
      opponentScore: snapshot.matchup?.opponentScore ?? null,
      gamesRemaining: snapshot.schedule?.myGamesRemaining ?? 0,
      rosterSlots,
      leagueAvgFpts,
      preloadedGames,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Optimizer] gather_data FAILED in ${Date.now() - t0}ms:`, message);
    return { error: `Data fetch failed: ${message}` };
  }
};

// ─── Node 3: score_candidates ─────────────────────────────────────────────────
// Scores every roster player as a drop candidate and every FA as a streamer.
// Uses the pre-loaded schedule — zero additional DB calls.

const scoreCandidatesNode = async (
  state: typeof LineupOptimizerAnnotation.State
): Promise<Partial<typeof LineupOptimizerAnnotation.State>> => {
  if (state.error) return {};

  const { roster, freeAgents, leagueAvgFpts, preloadedGames } = state;
  const windowStart = new Date(state.windowStart);
  const windowEnd = new Date(state.windowEnd);

  const [dropScores, streamScores] = await Promise.all([
    Promise.all(
      roster.map((p) =>
        scoreDroppingCandidate(
          p as OptimizerRosterPlayer,
          windowStart,
          windowEnd,
          leagueAvgFpts,
          preloadedGames
        )
      )
    ),
    Promise.all(
      freeAgents.map((fa) =>
        scoreStreamingCandidate(
          fa as OptimizerFreeAgentPlayer,
          windowStart,
          windowEnd,
          preloadedGames
        )
      )
    ),
  ]);

  const dropCandidates = dropScores
    .filter((d) => d.score >= DROP_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DROP_CANDIDATES);

  const streamCandidates = streamScores
    .filter((s) => s.score >= STREAM_SCORE_THRESHOLD && s.gamesRemaining > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_STREAM_CANDIDATES);

  console.log(
    `[Optimizer] score_candidates | dropCandidates=${dropCandidates.length}/${roster.length} (threshold=${DROP_SCORE_THRESHOLD}) streamCandidates=${streamCandidates.length}/${freeAgents.length} (threshold=${STREAM_SCORE_THRESHOLD})`
  );
  if (dropCandidates.length > 0) {
    console.log(`[Optimizer] top drop: ${dropCandidates[0].playerName} score=${dropCandidates[0].score.toFixed(1)}`);
  }
  if (streamCandidates.length > 0) {
    console.log(`[Optimizer] top stream: ${streamCandidates[0].playerName} score=${streamCandidates[0].score.toFixed(1)}`);
  }

  return { dropCandidates, streamCandidates };
};

// ─── Node 4: simulate_moves ───────────────────────────────────────────────────
// Deterministic: simulates every drop×add pair from the candidate sets.
// Cap: MAX_DROP_CANDIDATES × MAX_STREAM_CANDIDATES = 15 pairs max.

const simulateMovesNode = async (
  state: typeof LineupOptimizerAnnotation.State
): Promise<Partial<typeof LineupOptimizerAnnotation.State>> => {
  if (state.error) return {};
  if (state.dropCandidates.length === 0 || state.streamCandidates.length === 0) {
    console.log(
      `[Optimizer] simulate_moves: skipped — dropCandidates=${state.dropCandidates.length} streamCandidates=${state.streamCandidates.length}`
    );
    return { simulatedMoves: [] };
  }

  const { roster, rosterSlots, dropCandidates, streamCandidates, preloadedGames } = state;
  const windowStart = new Date(state.windowStart);
  const windowEnd = new Date(state.windowEnd);

  const pairs: Array<[typeof dropCandidates[number], typeof streamCandidates[number]]> = [];
  for (const drop of dropCandidates) {
    for (const stream of streamCandidates) {
      pairs.push([drop, stream]);
    }
  }

  const results = await Promise.all(
    pairs.map(([drop, stream]) => {
      const dropPlayer = roster.find((p) => p.playerId === drop.playerId);
      const addPlayer = state.freeAgents.find((fa) => fa.playerId === stream.playerId);
      if (!dropPlayer || !addPlayer) return Promise.resolve(null);

      return simulateMove(
        dropPlayer as OptimizerRosterPlayer,
        addPlayer as OptimizerFreeAgentPlayer,
        roster.map((p) => p as OptimizerRosterPlayer),
        rosterSlots,
        windowStart,
        windowEnd,
        preloadedGames
      ).catch(() => null);
    })
  );

  const simulatedMoves = results.filter(
    (r): r is NonNullable<typeof r> => r !== null && r.isLegal
  );

  const illegalCount = results.filter((r) => r !== null && !r.isLegal).length;
  const positiveCount = simulatedMoves.filter((m) => m.netGain > 0).length;
  console.log(
    `[Optimizer] simulate_moves | pairs=${pairs.length} legal=${simulatedMoves.length} illegal=${illegalCount} positive=${positiveCount}`
  );

  return { simulatedMoves };
};

// ─── Node 5: rank_moves ───────────────────────────────────────────────────────
// Pure sort — no async, no LLM. Filters out non-beneficial moves.

const rankMovesNode = (
  state: typeof LineupOptimizerAnnotation.State
): Partial<typeof LineupOptimizerAnnotation.State> => {
  if (state.error) return {};

  const { simulatedMoves, dropCandidates, streamCandidates } = state;

  const positive = simulatedMoves
    .filter((m) => m.netGain > 0)
    .sort((a, b) => b.netGain - a.netGain)
    .slice(0, MAX_RANKED_MOVES);

  const rankedMoves: RankedMove[] = positive.map((m, i) => {
    const dropCandidate = dropCandidates.find((d) => d.playerId === m.dropPlayerId);
    const streamCandidate = streamCandidates.find((s) => s.playerId === m.addPlayerId);
    return {
      rank: i + 1,
      dropPlayerId: m.dropPlayerId,
      dropPlayerName: m.dropPlayerName,
      addPlayerId: m.addPlayerId,
      addPlayerName: m.addPlayerName,
      netGain: m.netGain,
      baselineWindowFpts: m.baselineWindowFpts,
      projectedWindowFpts: m.projectedWindowFpts,
      confidence: m.confidence,
      warnings: m.warnings,
      dropScore: dropCandidate?.score ?? 0,
      streamScore: streamCandidate?.score ?? 0,
    };
  });

  console.log(
    `[Optimizer] rank_moves | positive moves=${positive.length} | top: ${rankedMoves[0] ? `DROP ${rankedMoves[0].dropPlayerName} → ADD ${rankedMoves[0].addPlayerName} (+${rankedMoves[0].netGain.toFixed(1)} fpts)` : "none"}`
  );

  return { rankedMoves };
};

// ─── Node 6: compose_recommendation ──────────────────────────────────────────
// The ONLY LLM call in this graph.
// Receives structured data, produces human-readable GM-voice recommendation.

const composeRecommendationNode = async (
  state: typeof LineupOptimizerAnnotation.State
): Promise<Partial<typeof LineupOptimizerAnnotation.State>> => {
  if (state.error) {
    return {
      recommendation: `I couldn't complete the lineup optimization: ${state.error}. Please make sure your league and team are synced.`,
    };
  }

  const lang = (state.language ?? "en") as SupportedLanguage;

  const promptContext = {
    language: lang,
    originalQuery: state.originalQuery,
    teamName: "Your Team",
    windowStart: new Date(state.windowStart).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    windowEnd: new Date(state.windowEnd).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    myScore: state.matchupScore,
    opponentScore: state.opponentScore,
    gamesRemaining: state.gamesRemaining,
    rankedMoves: state.rankedMoves,
  };

  const systemPrompt = getOptimizerPrompt(promptContext);

  // When there are no positive moves, give a clear "no action needed" response
  if (state.rankedMoves.length === 0) {
    console.log("[Optimizer] compose_recommendation: no positive moves — returning hold message");
    const noMoveMessage =
      lang === "el"
        ? "Μετά από ανάλυση, δεν βρέθηκαν κινήσεις waiver wire με θετικό κέρδος για το τρέχον παράθυρο. Η ομάδα σου είναι ήδη βελτιστοποιημένη — κράτα τους παίκτες σου."
        : "After running the numbers, there are no positive-gain waiver moves for the current window. Your roster is already optimized — hold your players.";
    return { recommendation: noMoveMessage };
  }

  console.log(`[Optimizer] compose_recommendation: LLM call for ${state.rankedMoves.length} move(s)`);
  const t0 = Date.now();

  try {
    const response = await composeLlm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(state.originalQuery),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    console.log(`[Optimizer] compose_recommendation done in ${Date.now() - t0}ms | outputLen=${content.length}`);
    return { recommendation: content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fallback: structured text without LLM flourish
    const fallback = state.rankedMoves
      .map(
        (m) =>
          `**DROP ${m.dropPlayerName} → ADD ${m.addPlayerName}** (+${m.netGain.toFixed(1)} fpts)\n` +
          `Confidence: ${m.confidence}` +
          (m.warnings.length > 0 ? ` | ⚠️ ${m.warnings.join("; ")}` : "")
      )
      .join("\n\n");
    console.error(`[Optimizer] compose_recommendation LLM error after ${Date.now() - t0}ms:`, message);
    return { recommendation: `## Lineup Recommendations\n\n${fallback}` };
  }
};

// ─── Error guard routing ──────────────────────────────────────────────────────

const continueOrEnd = (
  state: typeof LineupOptimizerAnnotation.State
): "gather_data" | "compose_recommendation" => {
  return state.error ? "compose_recommendation" : "gather_data";
};

// ─── Graph assembly ───────────────────────────────────────────────────────────

const workflow = new StateGraph(LineupOptimizerAnnotation)
  .addNode("parse_window", parseWindowNode)
  .addNode("gather_data", gatherDataNode)
  .addNode("score_candidates", scoreCandidatesNode)
  .addNode("simulate_moves", simulateMovesNode)
  .addNode("rank_moves", rankMovesNode)
  .addNode("compose_recommendation", composeRecommendationNode)
  .addEdge("__start__", "parse_window")
  .addConditionalEdges("parse_window", continueOrEnd, {
    gather_data: "gather_data",
    compose_recommendation: "compose_recommendation",
  })
  .addEdge("gather_data", "score_candidates")
  .addEdge("score_candidates", "simulate_moves")
  .addEdge("simulate_moves", "rank_moves")
  .addEdge("rank_moves", "compose_recommendation")
  .addEdge("compose_recommendation", END);

export const lineupOptimizerGraph = workflow.compile();

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RunLineupOptimizerInput {
  teamId: string | null;
  leagueId: string | null;
  language: string;
  query: string;
}

export interface RunLineupOptimizerResult {
  recommendation: string;
  rankedMoves: RankedMove[];
  error: string | null;
}

/**
 * Entry point for the Lineup Optimizer Graph.
 *
 * Called by the Supervisor when intent is "lineup_optimization".
 * Returns a human-readable recommendation and the structured move data.
 */
export async function runLineupOptimizer(
  input: RunLineupOptimizerInput
): Promise<RunLineupOptimizerResult> {
  const { teamId, leagueId, language, query } = input;

  const result = await lineupOptimizerGraph.invoke({
    teamId,
    leagueId,
    language,
    originalQuery: query,
  });

  return {
    recommendation:
      result.recommendation ??
      "Lineup optimization completed — no specific moves identified.",
    rankedMoves: result.rankedMoves ?? [],
    error: result.error ?? null,
  };
}
