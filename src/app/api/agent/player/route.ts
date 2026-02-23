/**
 * Player Research Agent API Route
 *
 * Exposes the PlayerResearchAgent as a REST endpoint.
 * Accepts a player name or natural language query and returns a structured
 * research report with live ESPN status + recent news analysis.
 *
 * POST /api/agent/player
 * Body: { query: string, playerName?: string }
 *
 * Response: PlayerResearchReport (JSON)
 */

import { NextRequest, NextResponse } from "next/server";
import { runPlayerResearch } from "@/agents/player-research/agent";
import { z } from "zod";

// Keep enough headroom for ESPN + Gemini + pgvector calls
export const maxDuration = 30;

const RequestSchema = z.object({
  query: z.string().min(2).max(300),
  playerName: z.string().optional(),
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

    const { query, playerName } = parsed.data;

    const report = await runPlayerResearch({ query, playerName });

    if (!report) {
      return NextResponse.json(
        { error: "Agent did not produce a report. The player may not be found." },
        { status: 404 }
      );
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("[Player Agent API] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Health check / schema discovery
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/agent/player",
    description: "Player Research Agent — live ESPN status + news synthesis",
    body: {
      query: "string (required) — natural language question or player name",
      playerName: "string (optional) — override for resolved player name",
    },
    example: {
      query: "What is Ja Morant's injury status?",
      playerName: "Ja Morant",
    },
  });
}
