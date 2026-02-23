import { NextRequest, NextResponse } from "next/server";
import { generateStrategicResponse } from "@/services/intelligence.service";
import type { ChatMessage } from '@/types/ai';
import type { SupportedLanguage } from "@/prompts/types";
import { searchNews } from "@/services/news.service";
import { authorizePerspectiveScope } from "@/utils/auth/perspective-authorization";

// Chat requests can include multiple upstream calls (Supabase + ESPN + Gemini).
// Keep enough headroom in production to avoid premature serverless termination.
export const maxDuration = 60;

interface RequestMessage {
    role: "user" | "assistant";
    content: string;
}

interface ChatRequestBody {
    messages: RequestMessage[];
    activeTeamId?: string | null;
    activeLeagueId?: string | null;
    language?: SupportedLanguage;
    evalMode?: boolean;
}

const STREAM_HEARTBEAT_TOKEN = "[[FV_STREAM_READY]]";
const IS_LOCAL_AI = process.env.USE_LOCAL_AI === "true" && process.env.VERCEL !== "1" && !process.env.VERCEL_ENV;
const ACTIVE_AI_PROVIDER = IS_LOCAL_AI ? "ollama" : "gemini";
const ACTIVE_AI_MODEL = IS_LOCAL_AI
    ? process.env.OLLAMA_MODEL || "llama3.1"
    : process.env.GEMINI_MODEL || "gemini-2.0-flash";

const isRateLimitError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    return error.message.includes("429");
};

/**
 * Chat API Route
 * 
 * Handles streaming chat responses by delegating orbit to the Intelligence Service.
 * This controller is now a thin wrapper around the core business logic.
 */
export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as ChatRequestBody;
        const { messages, activeTeamId, activeLeagueId, language = 'en', evalMode = false } = body;
        const shouldIncludeDebugContext = process.env.NODE_ENV === "development" && evalMode;
        const perspective = await authorizePerspectiveScope({ activeTeamId, activeLeagueId });
        const safeActiveTeamId = perspective.activeTeamId;
        const safeActiveLeagueId = perspective.activeLeagueId;

        if (perspective.status === "authorized") {
            console.log(`[Chat API] Authorized perspective: Team ${safeActiveTeamId}, League ${safeActiveLeagueId}`);
        } else if (perspective.status === "authorized_public") {
            console.log(`[Chat API] Authorized public perspective fallback: Team ${safeActiveTeamId}, League ${safeActiveLeagueId}`);
        } else if (perspective.status === "missing") {
            console.warn(`[Chat API] Missing perspective: Team ${activeTeamId}, League ${activeLeagueId}`);
        } else {
            console.warn(`[Chat API] Perspective scope denied (${perspective.status}). Falling back to generic context.`);
        }

        // Separate history from current message to prevent duplication in AI context
        const currentMessageContent = messages[messages.length - 1].content;
        const historyMessages = messages.slice(0, -1);
        let prefetchedNewsItems: unknown[] | undefined;

        if (shouldIncludeDebugContext) {
            try {
                const retrievedDocs = await searchNews(currentMessageContent);
                if (Array.isArray(retrievedDocs)) {
                    prefetchedNewsItems = retrievedDocs;
                }
            } catch (debugError) {
                console.warn("[Chat API] Failed to prefetch debug_context:", debugError);
            }
        }

        // Convert history to service format
        const history: ChatMessage[] = historyMessages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
            createdAt: new Date().toISOString(),
            feedback: null
        }));

        if (shouldIncludeDebugContext) {
            const debugContext: unknown[] = prefetchedNewsItems ?? [];
            const streamResult = await generateStrategicResponse(
                history,
                currentMessageContent,
                {
                    activeTeamId: safeActiveTeamId,
                    activeLeagueId: safeActiveLeagueId,
                    language,
                    prefetchedNewsItems,
                }
            );

            let output = "";
            for await (const chunk of streamResult) {
                if (chunk) output += chunk;
            }

            return NextResponse.json({
                output,
                debug_context: debugContext,
                provider: ACTIVE_AI_PROVIDER,
                model: ACTIVE_AI_MODEL,
            });
        }

        // Create response stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Send an immediate heartbeat so clients/proxies receive bytes
                    // even when context assembly and local model boot are slow.
                    controller.enqueue(encoder.encode(STREAM_HEARTBEAT_TOKEN));

                    // Run expensive orchestration inside the stream lifecycle so
                    // the response can be established immediately (prevents client
                    // fetch failures on slower local-model generations).
                    const streamResult = await generateStrategicResponse(
                        history,
                        currentMessageContent,
                        {
                            activeTeamId: safeActiveTeamId,
                            activeLeagueId: safeActiveLeagueId,
                            language,
                            prefetchedNewsItems,
                        }
                    );

                    for await (const chunk of streamResult) {
                        if (chunk) {
                            controller.enqueue(encoder.encode(chunk));
                        }
                    }
                } catch (err) {
                    console.error("[Chat API] Stream error:", err);
                    const fallback = isRateLimitError(err)
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
                "x-fanvise-ai-provider": ACTIVE_AI_PROVIDER,
                "x-fanvise-ai-model": ACTIVE_AI_MODEL,
            },
        });

    } catch (error: unknown) {
        console.error("[Chat API] Error:", error);

        // Relay 429 Too Many Requests
        if (isRateLimitError(error)) {
            return NextResponse.json({
                error: "FanVise is currently high in demand. Please wait a moment before your next strategic inquiry.",
                code: "RATE_LIMIT_EXCEEDED"
            }, { status: 429 });
        }

        const errorMessage = error instanceof Error ? error.message : "Unknown Error";
        const errorStack = error instanceof Error ? error.stack : undefined;

        return NextResponse.json({
            error: errorMessage,
            stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
        }, { status: 500 });
    }
}
