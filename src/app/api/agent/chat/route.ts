/**
 * Supervisor Agent Chat Route
 *
 * The sole AI chat endpoint. The LLM decides which tools to call based on
 * the user's question — no hardcoded data fetching order.
 *
 * POST /api/agent/chat
 *
 * Response: text/plain streaming OR JSON in evalMode.
 *
 * Routing strategy:
 * - Simple greetings / out-of-scope → fast path (no agent, direct LLM)
 * - Everything else → Supervisor agent with tool-calling loop
 *
 * @see docs/technical/Agentic_Architecture_LangGraph.md
 */

import { NextRequest, NextResponse } from "next/server";
import { streamSupervisor, runSupervisor, ACTIVE_PROVIDER, ACTIVE_MODEL } from "@/agents/supervisor/agent";
import { authorizePerspectiveScope } from "@/utils/auth/perspective-authorization";
import { z } from "zod";
import type { SupportedLanguage } from "@/prompts/types";

export const maxDuration = 60;

const STREAM_HEARTBEAT_TOKEN = "[[FV_STREAM_READY]]";

const RequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ).min(1),
  activeTeamId: z.string().nullish(),
  activeLeagueId: z.string().nullish(),
  language: z.string().optional().default("en"),
  evalMode: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { messages, activeTeamId, activeLeagueId, language, evalMode } = parsed.data;
    const supportedLanguage: SupportedLanguage = language === "el" ? "el" : "en";

    const perspective = await authorizePerspectiveScope({
      activeTeamId: activeTeamId ?? null,
      activeLeagueId: activeLeagueId ?? null,
    });

    const safeTeamId = perspective.activeTeamId ?? null;
    const safeLeagueId = perspective.activeLeagueId ?? null;

    if (process.env.NODE_ENV === "development") {
      console.log("[Agent Chat] Perspective:", {
        status: perspective.status,
        requestedTeamId: activeTeamId,
        requestedLeagueId: activeLeagueId,
        resolvedTeamId: safeTeamId,
        resolvedLeagueId: safeLeagueId,
      });
    }

    // Separate history from current message
    const currentMessage = messages[messages.length - 1].content;
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // ── Eval / debug mode: return JSON with full answer ────────────────────
    if (evalMode) {
      const result = await runSupervisor({
        query: currentMessage,
        history,
        teamId: safeTeamId,
        leagueId: safeLeagueId,
        language: supportedLanguage,
      });

      return NextResponse.json({
        output: result.answer,
        intent: result.intent,
        toolCallCount: result.toolCallCount,
        rankedMoves: result.rankedMoves,
        debug_context: result.debugContext ?? [],
        provider: ACTIVE_PROVIDER,
        model: ACTIVE_MODEL,
      });
    }

    // ── Streaming mode ─────────────────────────────────────────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(STREAM_HEARTBEAT_TOKEN));

          for await (const chunk of streamSupervisor({
            query: currentMessage,
            history,
            teamId: safeTeamId,
            leagueId: safeLeagueId,
            language: supportedLanguage,
          })) {
            if (chunk) {
              controller.enqueue(encoder.encode(chunk));
            }
          }
        } catch (err) {
          console.error("[Agent Chat API] Stream error:", err);
          const isRateLimit =
            err instanceof Error && err.message.includes("429");
          const fallback = isRateLimit
            ? "⚠️ Strategic Hold: FanVise is currently high in demand. Please retry in a few seconds."
            : "⚠️ Temporary issue while generating your response. Please retry.";
          controller.enqueue(encoder.encode(fallback));
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-fanvise-ai-provider": ACTIVE_PROVIDER,
        "x-fanvise-ai-model": ACTIVE_MODEL,
        "x-fanvise-agent": "supervisor",
      },
    });
  } catch (error) {
    console.error("[Agent Chat API] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Schema discovery
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/agent/chat",
    description: "Supervisor agent — dynamically selects tools based on the user question",
    agents: ["player_research", "free_agent_scan", "matchup_analysis", "lineup_optimization", "general_advice"],
    note: "Sole AI chat endpoint — Supervisor agent with dynamic tool-calling",
  });
}
