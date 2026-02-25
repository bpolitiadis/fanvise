/**
 * FanVise Supervisor Agent
 *
 * The top-level orchestrator. The LLM receives the user's question, reasons
 * about which tools to call (and in what order), executes them via a ReAct
 * loop, and synthesizes a final answer.
 *
 * Key properties:
 * - The LLM decides which tools to call — not hardcoded routing logic.
 * - Tools are called sequentially or in logical dependency order.
 * - A max tool-call cap (8) prevents runaway loops.
 * - Intent is classified upfront to help the answer node format output.
 * - Streaming: the graph returns an async iterable of text chunks.
 *
 * Architecture: ReAct loop with a ToolNode
 *   __start__ → classify_intent → agent → [tools → agent]* → synthesize → END
 *
 * @see docs/technical/Agentic_Architecture_LangGraph.md
 */

import { StateGraph, END } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { SupervisorAnnotation } from "./state";
import { SUPERVISOR_SYSTEM_PROMPT } from "./prompts";
import type { SupportedLanguage } from "@/prompts/types";
import { ALL_TOOLS } from "@/agents/shared/tool-registry";
import { createContextAwareToolNode } from "./tool-node-with-context";
import { USE_LOCAL_AI, OLLAMA_BASE_URL } from "@/agents/shared/ai-config";
import { classifyIntent } from "@/agents/shared/intent-classifier";
import { runLineupOptimizer } from "@/agents/lineup-optimizer/graph";
import type { QueryIntent } from "@/agents/shared/types";
import type { MoveRecommendation, MovesStreamPayload } from "@/types/optimizer";
import { getCurrentMatchupWindow } from "@/lib/time/matchup-window";

// Re-export so API route can read the active provider for response headers
export { ACTIVE_PROVIDER, ACTIVE_MODEL } from "@/agents/shared/ai-config";

const MAX_TOOL_CALLS = 15;

// ─── LLM setup ────────────────────────────────────────────────────────────────

const baseLlm = USE_LOCAL_AI
  ? new ChatOllama({
      model: process.env.OLLAMA_MODEL || "llama3.1",
      baseUrl: OLLAMA_BASE_URL,
      temperature: 0,
    })
  : new ChatGoogleGenerativeAI({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: 0,
    });

const llm = baseLlm.bindTools([...ALL_TOOLS]);

const toolsNode = createContextAwareToolNode();

// ─── Nodes ────────────────────────────────────────────────────────────────────

/**
 * Classify the user's intent using deterministic regex matching.
 *
 * Replaces the previous LLM-based classifier (saved 300-600ms per request).
 * The result gates the routing decision: lineup_optimization takes the fast
 * optimizer path; everything else falls through to the standard ReAct loop.
 */
const classifyIntentNode = (
  state: typeof SupervisorAnnotation.State
): Partial<typeof SupervisorAnnotation.State> => {
  const lastHuman = [...state.messages]
    .reverse()
    .find((m) => m._getType() === "human");
  const queryText =
    typeof lastHuman?.content === "string" ? lastHuman.content : "";

  const intent = classifyIntent(queryText);
  console.log(
    `[Supervisor] intent="${intent}" team=${state.teamId ?? "none"} league=${state.leagueId ?? "none"} query="${queryText.slice(0, 80)}${queryText.length > 80 ? "…" : ""}"`
  );
  return { intent };
};

/**
 * Lineup Optimizer delegation node.
 *
 * Runs when intent === "lineup_optimization" AND the user has a team+league context.
 * Calls the LineupOptimizerGraph which handles all data fetching and computation
 * deterministically, then uses a single focused LLM call to compose the output.
 * Sets `state.answer` directly, bypassing the ReAct tool loop entirely.
 */
const runOptimizerNode = async (
  state: typeof SupervisorAnnotation.State
): Promise<Partial<typeof SupervisorAnnotation.State>> => {
  const lastHuman = [...state.messages]
    .reverse()
    .find((m) => m._getType() === "human");
  const query =
    typeof lastHuman?.content === "string" ? lastHuman.content : "";

  console.log(`[Supervisor] → run_optimizer (team=${state.teamId}, league=${state.leagueId})`);
  const t0 = Date.now();

  const result = await runLineupOptimizer({
    teamId: state.teamId,
    leagueId: state.leagueId,
    language: state.language ?? "en",
    query,
  });

  console.log(
    `[Supervisor] ← run_optimizer completed in ${Date.now() - t0}ms | moves=${result.rankedMoves.length}`
  );

  return {
    answer: result.recommendation,
    rankedMoves: result.rankedMoves as MoveRecommendation[],
  };
};

/**
 * Main ReAct agent node.
 * The LLM sees the system prompt + full message history and decides:
 *   A) Call a tool to get more data, or
 *   B) Produce a final text answer.
 */
const agentNode = async (
  state: typeof SupervisorAnnotation.State
): Promise<Partial<typeof SupervisorAnnotation.State>> => {
  if (state.toolCallCount >= MAX_TOOL_CALLS) {
    return {
      error: `Reached max tool calls (${MAX_TOOL_CALLS}). Synthesizing from available data.`,
    };
  }

  // Inject teamId/leagueId context into the system prompt so the LLM
  // always knows what perspective to use without being told in every turn.
  const contextNote =
    state.teamId && state.leagueId
      ? `\n\n[CONTEXT] Active team ID: ${state.teamId}. Active league ID: ${state.leagueId}. These IDs are AUTO-INJECTED into tool calls — you may omit them. For team audits, roster overviews, standings, or matchup questions: INVOKE get_my_roster, get_matchup_details, and get_league_standings — do not describe a plan. Actually call the tools now.`
      : state.teamId
        ? `\n\n[CONTEXT] Active team ID: ${state.teamId}. League ID: ${state.leagueId ?? "default"}. Invoke get_my_roster, get_matchup_details, get_league_standings when the user asks about their team, standings, or matchup.`
        : "\n\n[CONTEXT] No team perspective active. Provide general NBA fantasy advice. Do NOT call get_my_roster, get_matchup_details, or get_league_standings.";

  const lang = (state.language ?? "en") as SupportedLanguage;
  const languageInstruction =
    lang === "el"
      ? "\n\n[LANGUAGE] You MUST respond exclusively in Greek (Ελληνικά). All player names, stats, and recommendations must be in Greek."
      : "\n\n[LANGUAGE] Respond in English.";

  const systemMessage = new SystemMessage(
    SUPERVISOR_SYSTEM_PROMPT + contextNote + languageInstruction
  );

  // Gemini requires ToolMessage content to be a string — serialize objects if needed.
  const normalizedMessages = state.messages.map((msg) => {
    if (msg instanceof ToolMessage && typeof msg.content !== "string") {
      return new ToolMessage({
        content: JSON.stringify(msg.content),
        tool_call_id: msg.tool_call_id,
        name: msg.name,
      });
    }
    return msg;
  });

  // Gemini 2.0 often outputs plans as text instead of tool_calls. Force tool use when we
  // have team context and no tool results yet (first pass for audits).
  // Only pass tool_choice for Gemini — Ollama uses a different options shape.
  const hasToolResults = state.messages.some((m) => m._getType?.() === "tool");
  // lineup_optimization is handled by run_optimizer and never reaches this node.
  const intentNeedsTools = [
    "team_audit",
    "matchup_analysis",
    "free_agent_scan",
    "player_research",
  ].includes(state.intent ?? "");
  const queryNeedsRoster = (() => {
    const lastHuman = [...state.messages].reverse().find((m) => m._getType?.() === "human");
    const content = typeof lastHuman?.content === "string" ? lastHuman.content.toLowerCase() : "";
    return /\b(audit|roster|overview|standings|matchup|my team|who's on)\b/.test(content);
  })();
  const shouldForceTools =
    !USE_LOCAL_AI &&
    state.teamId &&
    state.leagueId &&
    !hasToolResults &&
    (intentNeedsTools || queryNeedsRoster);

  const iteration = state.toolCallCount + 1;
  console.log(
    `[Supervisor] → LLM call #${iteration} | intent=${state.intent ?? "none"} | forceTools=${shouldForceTools} | msgHistory=${normalizedMessages.length}`
  );
  const t0 = Date.now();

  const response = await llm.invoke(
    [systemMessage, ...normalizedMessages],
    shouldForceTools ? ({ tool_choice: "any" } as object) : undefined
  );

  const toolCallNames = (response as AIMessage).tool_calls?.map((tc) => tc.name) ?? [];
  console.log(
    `[Supervisor] ← LLM call #${iteration} in ${Date.now() - t0}ms | tool_calls=[${toolCallNames.join(", ") || "none — final answer"}]`
  );

  return {
    messages: [response],
    toolCallCount: 1,
  };
};

/** Detects when the LLM output a "plan" (JSON/tool description) instead of invoking tools */
const looksLikePlan = (text: string): boolean => {
  const t = text.trim();
  if (t.length < 50) return false;
  const hasToolJson = /"name"\s*:\s*"get_\w+"/.test(t) || /"parameters"\s*:\s*\{/.test(t);
  const hasPlanPhrasing =
    /\b(To answer|we need to call|Here is the (JSON|plan)|function calls?)\b/i.test(t) ||
    /call (get_my_roster|get_matchup)/i.test(t);
  return hasToolJson || (hasPlanPhrasing && t.includes("}"));
};

/**
 * Synthesizes the final answer from the last LLM message.
 * Appends uncertainty boilerplate for injury queries.
 * Replaces plan-as-text with a friendly prompt to retry.
 */
const synthesizeNode = (
  state: typeof SupervisorAnnotation.State
): Partial<typeof SupervisorAnnotation.State> => {
  const lastMessage = state.messages[state.messages.length - 1];
  const rawText =
    typeof lastMessage?.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage?.content ?? "");

  let answer = rawText.trim();

  // Detect plan-as-text (LLM described tool calls instead of invoking them)
  const hasToolResults = state.messages.some((m) => m._getType?.() === "tool");
  if (!hasToolResults && looksLikePlan(answer)) {
    console.warn("[Supervisor] plan-as-text detected — replacing with retry message");
    answer =
      "I need to fetch your data first. Please try again — I'll run the tools this time and give you a full audit.";
  }

  const toolCount = state.messages.filter((m) => m._getType?.() === "tool").length;
  console.log(
    `[Supervisor] synthesize | intent=${state.intent ?? "none"} | toolResults=${toolCount} | answerLen=${answer.length}${state.error ? " | ⚠️ capped" : ""}`
  );

  // Append error notice if we hit the tool cap
  if (state.error) {
    answer = `${answer}\n\n⚠️ Note: Some data may be incomplete — analysis was capped to prevent excessive API calls.`;
  }

  return { answer };
};

// ─── Routing ──────────────────────────────────────────────────────────────────

/**
 * Routes after intent classification.
 *
 * - lineup_optimization + team context → dedicated optimizer graph (fast path)
 * - everything else → existing ReAct tool loop
 */
const routeAfterClassify = (
  state: typeof SupervisorAnnotation.State
): "run_optimizer" | "agent" => {
  if (
    state.intent === "lineup_optimization" &&
    state.teamId &&
    state.leagueId
  ) {
    return "run_optimizer";
  }
  return "agent";
};

const shouldContinue = (
  state: typeof SupervisorAnnotation.State
): "tools" | "synthesize" => {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  // LLM is requesting tool calls — route to tools node
  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  // Hit max iterations — force synthesis
  if (state.error) {
    return "synthesize";
  }

  // LLM produced text output — we're done
  return "synthesize";
};

// ─── Graph ────────────────────────────────────────────────────────────────────
//
// Full routing:
//   __start__
//       │
//       ▼
//   classify_intent (sync, no LLM)
//       │
//       ├─ lineup_optimization + team context → run_optimizer → synthesize → END
//       │
//       └─ everything else → agent → [tools → agent]* → synthesize → END

const workflow = new StateGraph(SupervisorAnnotation)
  .addNode("classify_intent", classifyIntentNode)
  .addNode("run_optimizer", runOptimizerNode)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addNode("synthesize", synthesizeNode)
  .addEdge("__start__", "classify_intent")
  .addConditionalEdges("classify_intent", routeAfterClassify, {
    run_optimizer: "run_optimizer",
    agent: "agent",
  })
  // run_optimizer sets state.answer directly — skip synthesize, which would
  // overwrite it with state.messages[last] = the original HumanMessage (user query).
  .addEdge("run_optimizer", END)
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    synthesize: "synthesize",
  })
  .addEdge("tools", "agent")
  .addEdge("synthesize", END);

export const supervisorAgent = workflow.compile();

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SupervisorInput {
  /** The user's current message */
  query: string;
  /** Prior conversation messages for multi-turn context */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Active team perspective */
  teamId?: string | null;
  /** Active league perspective */
  leagueId?: string | null;
  /** Response language from UI toggle ("en" | "el") */
  language?: SupportedLanguage;
}

/** Sentinel token prefix embedded at the end of the text stream for optimizer responses */
export const MOVES_STREAM_TOKEN_PREFIX = "[[FV_MOVES:";
export const MOVES_STREAM_TOKEN_SUFFIX = "]]";

export interface SupervisorResult {
  answer: string;
  intent: QueryIntent | null;
  toolCallCount: number;
  rankedMoves: MoveRecommendation[];
  /** Tool call results for eval observability (MRR, context_recall). Empty for optimizer path. */
  debugContext?: string[];
}

/**
 * Run the Supervisor agent for a single turn.
 * Returns the final answer and metadata.
 */
export async function runSupervisor(input: SupervisorInput): Promise<SupervisorResult> {
  const { query, history = [], teamId, leagueId, language = "en" } = input;

  const messages = [
    ...history.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(query),
  ];

  const result = await supervisorAgent.invoke(
    {
      messages,
      teamId: teamId ?? null,
      leagueId: leagueId ?? null,
      language,
    },
    // classify_intent + up to MAX_TOOL_CALLS * (agent → tools) + synthesize
    { recursionLimit: 50 }
  );

  // Collect tool results for eval observability (MRR, context_recall)
  const debugContext: string[] = [];
  for (const msg of result.messages ?? []) {
    if (msg._getType?.() === "tool" && msg instanceof ToolMessage) {
      const content = msg.content;
      debugContext.push(
        typeof content === "string" ? content : JSON.stringify(content)
      );
    }
  }

  return {
    answer: result.answer ?? "I was unable to generate a response. Please try again.",
    intent: result.intent,
    toolCallCount: result.toolCallCount,
    rankedMoves: result.rankedMoves ?? [],
    debugContext: debugContext.length > 0 ? debugContext : undefined,
  };
}

/**
 * Run the Supervisor agent with streaming output.
 * Yields text chunks as they are produced by the LLM.
 */
export async function* streamSupervisor(
  input: SupervisorInput
): AsyncGenerator<string> {
  const { query, history = [], teamId, leagueId, language = "en" } = input;

  const messages = [
    ...history.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(query),
  ];

  const stream = await supervisorAgent.stream(
    {
      messages,
      teamId: teamId ?? null,
      leagueId: leagueId ?? null,
      language,
    },
    // classify_intent + up to MAX_TOOL_CALLS * (agent → tools) + synthesize
    { streamMode: "values", recursionLimit: 50 }
  );

  let lastAnswer = "";
  let finalRankedMoves: MoveRecommendation[] = [];
  const finalWindowStart = "";
  const finalWindowEnd = "";

  for await (const chunk of stream) {
    // Only yield when a new final answer is available
    if (chunk.answer && chunk.answer !== lastAnswer) {
      const newContent = chunk.answer.slice(lastAnswer.length);
      if (newContent) yield newContent;
      lastAnswer = chunk.answer;
    }
    // Accumulate moves data from the optimizer node
    if (chunk.rankedMoves?.length > 0) {
      finalRankedMoves = chunk.rankedMoves as MoveRecommendation[];
    }
  }

  // Fallback: if the graph set an answer via run_optimizer but streamMode didn't
  // surface it in chunk.answer, yield the agent's fallback message.
  // NOTE: we intentionally do NOT yield messages[last] here — that would be the
  // original HumanMessage (user query), not a real response.
  if (!lastAnswer) {
    yield "I was unable to generate a response for that query. Please try again.";
  }

  // If the optimizer produced structured moves, emit them as a sentinel token.
  // The frontend strips this from displayed text and renders MoveCard components.
  if (finalRankedMoves.length > 0) {
    const payload: MovesStreamPayload = {
      moves: finalRankedMoves,
      fetchedAt: new Date().toISOString(),
      windowStart: finalWindowStart || new Date().toISOString(),
      windowEnd:
        finalWindowEnd || getCurrentMatchupWindow().end.toISOString(),
    };
    const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    yield `${MOVES_STREAM_TOKEN_PREFIX}${base64}${MOVES_STREAM_TOKEN_SUFFIX}`;
  }
}
