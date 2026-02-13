import { NextRequest, NextResponse } from "next/server";
import { generateStrategicResponse } from "@/services/intelligence.service";
import type { ChatMessage } from '@/types/ai';
import type { SupportedLanguage } from "@/prompts/types";
import { searchNews } from "@/services/news.service";

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

        if (!activeTeamId || !activeLeagueId) {
            console.warn(`[Chat API] Incoming request with MISSING perspective: Team: ${activeTeamId}, League: ${activeLeagueId}`);
        } else {
            console.log(`[Chat API] Incoming request with perspective: Team: ${activeTeamId}, League: ${activeLeagueId}`);
        }

        // Separate history from current message to prevent duplication in AI context
        const currentMessageContent = messages[messages.length - 1].content;
        const historyMessages = messages.slice(0, -1);

        // Convert history to service format
        const history: ChatMessage[] = historyMessages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
            createdAt: new Date().toISOString(),
            feedback: null
        }));

        // Generate streaming response using Intelligence Service
        const streamResult = await generateStrategicResponse(
            history,
            currentMessageContent,
            { activeTeamId, activeLeagueId, language }
        );

        if (shouldIncludeDebugContext) {
            let debugContext: unknown[] = [];
            try {
                const retrievedDocs = await searchNews(currentMessageContent);
                if (Array.isArray(retrievedDocs)) {
                    debugContext = retrievedDocs;
                }
            } catch (debugError) {
                console.warn("[Chat API] Failed to fetch debug_context:", debugError);
            }

            let output = "";
            for await (const chunk of streamResult) {
                if (chunk) output += chunk;
            }

            return NextResponse.json({
                output,
                debug_context: debugContext,
            });
        }

        // Create response stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of streamResult) {
                        if (chunk) {
                            controller.enqueue(encoder.encode(chunk));
                        }
                    }
                } catch (err) {
                    console.error("[Chat API] Stream error:", err);
                } finally {
                    controller.close();
                }
            },
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
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
