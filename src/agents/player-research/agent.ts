/**
 * Player Research Agent
 *
 * FanVise's first LangGraph agent (Step 1 of the Agentic Architecture).
 * Given a player name or question, it:
 *  1. Fetches live ESPN injury/status data via `get_espn_player_status`
 *  2. Searches the news vector store via `get_player_news`
 *  3. Synthesizes both into a structured recommendation
 *
 * Architecture:
 *  - LangGraph `StateGraph` with a ReAct-style tool-calling loop
 *  - Gemini 2.0 Flash as the reasoning model (via @langchain/google-genai)
 *  - Max 4 iterations to prevent runaway tool calls
 *  - Returns a typed `PlayerResearchReport` on completion
 *
 * @see docs/technical/Player_Research_Agent.md
 * @see docs/technical/Agentic_Architecture_LangGraph.md
 */

import { StateGraph, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";
import {
  PlayerResearchAnnotation,
  type PlayerResearchReport,
  type PlayerStatusResult,
  type NewsItem,
} from "./state";
import { getEspnPlayerStatusTool, getPlayerNewsTool } from "./tools";
import { PLAYER_RESEARCH_SYSTEM_PROMPT } from "./prompts";
import { OLLAMA_BASE_URL, USE_LOCAL_AI } from "@/agents/shared/ai-config";

const MAX_ITERATIONS = 4;

const tools = [getEspnPlayerStatusTool, getPlayerNewsTool];
const toolNode = new ToolNode(tools);

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

const llm = baseLlm.bindTools(tools);

// ─── Nodes ───────────────────────────────────────────────────────────────────

/**
 * Agent node: asks the LLM what to do next.
 * Returns a tool call or a final text response.
 */
const agentNode = async (
  state: typeof PlayerResearchAnnotation.State
) => {
  const { messages, iterationCount } = state;

  if (iterationCount >= MAX_ITERATIONS) {
    return {
      iterationCount: 0,
      error: `Max iterations (${MAX_ITERATIONS}) reached without a complete report.`,
    };
  }

  const systemMessage = new SystemMessage(PLAYER_RESEARCH_SYSTEM_PROMPT);
  const response = await llm.invoke([systemMessage, ...messages]);

  return {
    messages: [response],
    iterationCount: 1,
  };
};

/**
 * Parses the LLM's final text response into a typed PlayerResearchReport.
 * Falls back to a minimal report if parsing is unclear.
 */
const buildReportNode = (
  state: typeof PlayerResearchAnnotation.State
): Partial<typeof PlayerResearchAnnotation.State> => {
  const { messages, playerName, espnStatus, newsItems } = state;

  const lastMessage = messages[messages.length - 1];
  const content =
    typeof lastMessage?.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage?.content ?? "");

  const extractLine = (label: string): string | null => {
    const match = content.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`));
    return match?.[1]?.trim() ?? null;
  };

  const rawRecommendation = extractLine("Recommendation")?.toUpperCase() ?? "MONITOR";
  const validRecommendations = ["HOLD", "STREAM", "DROP", "MONITOR", "ACTIVE"] as const;
  const recommendation = validRecommendations.includes(
    rawRecommendation as (typeof validRecommendations)[number]
  )
    ? (rawRecommendation as PlayerResearchReport["recommendation"])
    : "MONITOR";

  const rawConfidence = extractLine("Confidence")?.toUpperCase() ?? "LOW";
  const validConfidences = ["HIGH", "MEDIUM", "LOW"] as const;
  const confidence = validConfidences.includes(rawConfidence as (typeof validConfidences)[number])
    ? (rawConfidence as PlayerResearchReport["confidence"])
    : "LOW";

  const sources: string[] = [];
  if (espnStatus?.source) sources.push(espnStatus.source);
  newsItems.forEach((item) => {
    if (item.source && !sources.includes(item.source)) sources.push(item.source);
  });

  const report: PlayerResearchReport = {
    playerName: extractLine("Player") ?? playerName,
    status: extractLine("Status") ?? espnStatus?.injuryStatus ?? "UNKNOWN",
    injuryType: extractLine("Injury") ?? espnStatus?.injuryType ?? null,
    expectedReturnDate: extractLine("Expected Return") ?? espnStatus?.expectedReturnDate ?? null,
    recommendation,
    confidence,
    summary: extractLine("Summary") ?? content.substring(0, 300),
    sources,
    fetchedAt: new Date().toISOString(),
  };

  return { report };
};

/**
 * Extracts tool call results from message history into typed state fields.
 * Runs after the tool node executes so downstream nodes have clean data.
 */
const extractToolResultsNode = (
  state: typeof PlayerResearchAnnotation.State
): Partial<typeof PlayerResearchAnnotation.State> => {
  const updates: Partial<typeof PlayerResearchAnnotation.State> = {};

  for (const message of state.messages) {
    if (message._getType() !== "tool") continue;

    // Tool messages have a `name` field indicating which tool was called
    const toolMsg = message as { name?: string; content: unknown };
    const content = toolMsg.content;
    const parsed = typeof content === "string" ? tryParse(content) : content;

    if (toolMsg.name === "get_espn_player_status" && parsed) {
      updates.espnStatus = parsed as PlayerStatusResult;
    }

    if (toolMsg.name === "get_player_news" && Array.isArray(parsed)) {
      updates.newsItems = parsed as NewsItem[];
    }
  }

  return updates;
};

const tryParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

// ─── Routing ─────────────────────────────────────────────────────────────────

/**
 * Decides whether to call a tool or finalize the report.
 */
const shouldContinue = (
  state: typeof PlayerResearchAnnotation.State
): "tools" | "build_report" => {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  if (state.error) {
    return "build_report";
  }

  return "build_report";
};

// ─── Graph ────────────────────────────────────────────────────────────────────

const workflow = new StateGraph(PlayerResearchAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addNode("extract_results", extractToolResultsNode)
  .addNode("build_report", buildReportNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    build_report: "build_report",
  })
  .addEdge("tools", "extract_results")
  .addEdge("extract_results", "agent")
  .addEdge("build_report", END);

export const playerResearchAgent = workflow.compile();

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RunPlayerResearchOptions {
  query: string;
  playerName?: string;
}

/**
 * Entry point for the Player Research Agent.
 * @param options.query - Natural language question about a player
 * @param options.playerName - Optional: resolved player name if already known
 * @returns Structured PlayerResearchReport
 */
export async function runPlayerResearch(
  options: RunPlayerResearchOptions
): Promise<PlayerResearchReport | null> {
  const { query, playerName } = options;

  const result = await playerResearchAgent.invoke({
    messages: [new HumanMessage(query)],
    playerName: playerName ?? query,
    originalQuery: query,
  });

  return result.report ?? null;
}
