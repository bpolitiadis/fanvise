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
import { SUPERVISOR_SYSTEM_PROMPT, INTENT_CLASSIFIER_PROMPT } from "./prompts";
import type { SupportedLanguage } from "@/prompts/types";
import { ALL_TOOLS } from "@/agents/shared/tool-registry";
import { createContextAwareToolNode } from "./tool-node-with-context";
import { USE_LOCAL_AI, OLLAMA_BASE_URL } from "@/agents/shared/ai-config";
import type { QueryIntent } from "@/agents/shared/types";

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

/** A separate, lighter LLM call for intent classification — no tools needed. */
const classifierLlm = USE_LOCAL_AI
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

const toolsNode = createContextAwareToolNode();

// ─── Nodes ────────────────────────────────────────────────────────────────────

/**
 * Classify the user's intent before entering the ReAct loop.
 * This is a cheap single-call classification — no tools.
 */
const classifyIntentNode = async (
  state: typeof SupervisorAnnotation.State
): Promise<Partial<typeof SupervisorAnnotation.State>> => {
  const lastHuman = [...state.messages]
    .reverse()
    .find((m) => m._getType() === "human");
  const queryText =
    typeof lastHuman?.content === "string" ? lastHuman.content : "";

  if (!queryText) return { intent: "general_advice" };

  try {
    const response = await classifierLlm.invoke([
      new SystemMessage(INTENT_CLASSIFIER_PROMPT),
      new HumanMessage(queryText),
    ]);
    const raw =
      typeof response.content === "string"
        ? response.content.trim().toLowerCase()
        : "";

    const validIntents: QueryIntent[] = [
      "player_research",
      "free_agent_scan",
      "matchup_analysis",
      "lineup_optimization",
      "general_advice",
    ];
    const normalized = raw.replace(/\s+/g, "_");
    const intent = validIntents.find((i) => normalized.includes(i) || raw.includes(i)) ?? "general_advice";
    return { intent };
  } catch {
    return { intent: "general_advice" };
  }
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
  const intentNeedsTools = ["lineup_optimization", "matchup_analysis", "free_agent_scan", "player_research"].includes(
    state.intent ?? ""
  );
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

  const response = await llm.invoke(
    [systemMessage, ...normalizedMessages],
    shouldForceTools ? ({ tool_choice: "any" } as object) : undefined
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
    if (process.env.NODE_ENV === "development") {
      console.warn("[Supervisor] LLM output plan-as-text instead of tool_calls. Replacing with retry message.");
    }
    answer =
      "I need to fetch your data first. Please try again — I'll run the tools this time and give you a full audit.";
  }

  // Append error notice if we hit the tool cap
  if (state.error) {
    answer = `${answer}\n\n⚠️ Note: Some data may be incomplete — analysis was capped to prevent excessive API calls.`;
  }

  return { answer };
};

// ─── Routing ──────────────────────────────────────────────────────────────────

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

const workflow = new StateGraph(SupervisorAnnotation)
  .addNode("classify_intent", classifyIntentNode)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addNode("synthesize", synthesizeNode)
  .addEdge("__start__", "classify_intent")
  .addEdge("classify_intent", "agent")
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    synthesize: "synthesize",
  })
  .addEdge("tools", "agent")  // After tools run → back to agent to reason about results
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

export interface SupervisorResult {
  answer: string;
  intent: QueryIntent | null;
  toolCallCount: number;
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

  const result = await supervisorAgent.invoke({
    messages,
    teamId: teamId ?? null,
    leagueId: leagueId ?? null,
    language,
  });

  return {
    answer: result.answer ?? "I was unable to generate a response. Please try again.",
    intent: result.intent,
    toolCallCount: result.toolCallCount,
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
    { streamMode: "values" }
  );

  let lastAnswer = "";

  for await (const chunk of stream) {
    // Only yield when a new final answer is available
    if (chunk.answer && chunk.answer !== lastAnswer) {
      const newContent = chunk.answer.slice(lastAnswer.length);
      if (newContent) yield newContent;
      lastAnswer = chunk.answer;
    }
  }

  // Fallback: yield the last message content from the agent node directly
  if (!lastAnswer) {
    const lastMsg = messages[messages.length - 1];
    const content = typeof lastMsg?.content === "string" ? lastMsg.content : "";
    if (content) yield content;
  }
}
