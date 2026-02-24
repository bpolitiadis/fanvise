/**
 * Context-Aware Tool Node
 *
 * Wraps ToolNode to inject teamId and leagueId from graph state into tool
 * invocations. This ensures roster, matchup, and standings tools use the
 * user's active perspective even when the LLM omits these IDs.
 *
 * Tools that receive injection:
 * - get_my_roster, get_matchup_details: teamId, leagueId
 * - get_league_standings: leagueId
 * - get_free_agents: leagueId
 */

import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, BaseMessage, isAIMessage } from "@langchain/core/messages";
import { ALL_TOOLS } from "@/agents/shared/tool-registry";

interface StateWithContext {
  messages: BaseMessage[];
  teamId?: string | null;
  leagueId?: string | null;
}

const TOOLS_NEED_TEAM_ID = new Set([
  "get_my_roster",
  "get_matchup_details",
  "simulate_move",
  "validate_lineup_legality",
]);
const TOOLS_NEED_LEAGUE_ID = new Set([
  "get_my_roster",
  "get_matchup_details",
  "get_league_standings",
  "get_free_agents",
  "simulate_move",
  "validate_lineup_legality",
]);

function injectContextIntoArgs(
  toolName: string,
  args: Record<string, unknown>,
  teamId: string | null,
  leagueId: string | null
): Record<string, unknown> {
  const injected = { ...args };

  if (TOOLS_NEED_TEAM_ID.has(toolName) && teamId && !injected.teamId) {
    injected.teamId = teamId;
  }

  if (TOOLS_NEED_LEAGUE_ID.has(toolName) && leagueId && !injected.leagueId) {
    injected.leagueId = leagueId;
  }

  return injected;
}

/**
 * Creates a ToolNode that injects teamId/leagueId from state into tool args.
 * The standard ToolNode receives the full state; we intercept and merge context.
 */
export function createContextAwareToolNode() {
  const baseNode = new ToolNode([...ALL_TOOLS]);

  return async (state: StateWithContext) => {
    const { messages, teamId, leagueId } = state;
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || !isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
      return baseNode.invoke(state);
    }

    // Log every tool call the LLM decided to make, with key args (sanitised).
    // This makes it trivial to reconstruct the agent's reasoning from server logs
    // without having to reverse-engineer ESPN HTTP URLs.
    if (process.env.NODE_ENV === "development") {
      for (const tc of lastMessage.tool_calls) {
        const safeArgs = { ...((tc.args ?? {}) as Record<string, unknown>) };
        // Redact large/noisy fields that add no debug value
        for (const k of ["leagueId", "teamId"]) delete safeArgs[k];
        console.log(`[Agent Tool] → ${tc.name}`, JSON.stringify(safeArgs));
      }
    }

    // Clone tool calls with injected args so ToolNode uses them
    const modifiedToolCalls = lastMessage.tool_calls.map((tc) => ({
      ...tc,
      args: injectContextIntoArgs(
        tc.name,
        (tc.args ?? {}) as Record<string, unknown>,
        teamId ?? null,
        leagueId ?? null
      ),
    }));

    const modifiedAiMessage = new AIMessage({
      content: lastMessage.content,
      tool_calls: modifiedToolCalls,
    });

    const modifiedMessages = [...messages.slice(0, -1), modifiedAiMessage];
    const modifiedState = { ...state, messages: modifiedMessages };

    const t0 = Date.now();
    const result = await baseNode.invoke(modifiedState);

    if (process.env.NODE_ENV === "development") {
      const names = modifiedToolCalls.map((tc) => tc.name).join(", ");
      console.log(`[Agent Tool] ← ${names} completed in ${Date.now() - t0}ms`);
    }

    return result;
  };
}
