import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt, contextFromSnapshot } from "@/prompts";
import type { SupportedLanguage, MatchupContext, ScheduleContext } from "@/prompts/types";
import { generateStreamingResponse, type ChatMessage } from "@/services/ai.service";
import { buildIntelligenceSnapshot } from "@/services/league.service";
import { searchNews } from "@/lib/services/news-service";

/**
 * Chat API Route
 * 
 * Handles streaming chat responses using the centralized Prompt Engine
 * and Intelligence Snapshot system.
 */
export async function POST(req: NextRequest) {
    try {
        const { messages, activeTeamId, activeLeagueId, language = 'en' } = await req.json();
        const lastMessage = messages[messages.length - 1];

        // 1. Fetch News Context (RAG)
        let newsContext = "";
        try {
            const newsItems = await searchNews(lastMessage.content);
            if (newsItems && newsItems.length > 0) {
                newsContext = newsItems
                    .map((item: any) => `- [${item.published_at || 'Recent'}] ${item.title}: ${item.summary || item.content}`)
                    .join("\n");
            }
        } catch (newsError) {
            console.error("[Chat API] Failed to fetch news:", newsError);
        }

        // 2. Build Intelligence Snapshot (League/Team/Matchup Context)
        let systemInstruction = "";

        if (activeTeamId && activeLeagueId) {
            try {
                const snapshot = await buildIntelligenceSnapshot(activeLeagueId, activeTeamId);

                // Convert snapshot to PromptContext
                const promptContext = contextFromSnapshot(
                    {
                        league: {
                            name: snapshot.league.name,
                            scoringSettings: snapshot.league.scoringSettings,
                            rosterSlots: snapshot.league.rosterSlots,
                        },
                        myTeam: snapshot.myTeam,
                        opponent: snapshot.opponent,
                        matchup: snapshot.matchup,
                        schedule: snapshot.schedule,
                    },
                    language as SupportedLanguage,
                    newsContext ? `Recent News & Intelligence:\n${newsContext}` : undefined
                );

                // Generate system prompt using the Prompt Engine
                systemInstruction = getSystemPrompt('consigliere', promptContext);

                console.log(`[Chat API] Context built: League[${snapshot.league.name}] Team[${snapshot.myTeam.name}] News[${newsContext.length > 0}]`);
            } catch (snapshotError) {
                console.error("[Chat API] Failed to build intelligence snapshot:", snapshotError);
                // Fall back to basic prompt
                systemInstruction = buildFallbackPrompt(newsContext);
            }
        } else {
            console.warn("[Chat API] No active perspective (team/league ID) provided");
            systemInstruction = buildFallbackPrompt(newsContext);
        }

        // 3. Convert history to service format
        const history: ChatMessage[] = messages.slice(0, -1).map((m: any) => ({
            role: m.role === "user" ? "user" : "model",
            content: m.content,
        }));

        // 4. Generate streaming response using AI Service
        const streamResult = await generateStreamingResponse(
            history,
            lastMessage.content,
            { systemInstruction }
        );

        // 5. Create response stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Check if it's an async iterable (Gemini) or ReadableStream (Ollama)
                    if (Symbol.asyncIterator in streamResult) {
                        // Gemini async iterable
                        for await (const chunk of streamResult as AsyncIterable<string>) {
                            if (chunk) {
                                controller.enqueue(encoder.encode(chunk));
                            }
                        }
                    } else {
                        // Ollama ReadableStream
                        const reader = (streamResult as ReadableStream<Uint8Array>).getReader();
                        const decoder = new TextDecoder();

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            const chunk = decoder.decode(value);
                            const lines = chunk.split('\n');

                            for (const line of lines) {
                                if (!line.trim()) continue;
                                try {
                                    const json = JSON.parse(line);
                                    if (json.message?.content) {
                                        controller.enqueue(encoder.encode(json.message.content));
                                    }
                                } catch {
                                    // Fragmented JSON, skip
                                }
                            }
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

    } catch (error: any) {
        console.error("[Chat API] Error:", error);

        // Relay 429 Too Many Requests
        if (error?.message?.includes('429') || error?.status === 429) {
            return NextResponse.json({
                error: "FanVise is currently high in demand. Please wait a moment before your next strategic inquiry.",
                code: "RATE_LIMIT_EXCEEDED"
            }, { status: 429 });
        }

        return NextResponse.json({
            error: error.message || "Unknown Error",
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}

/**
 * Builds a minimal fallback prompt when Intelligence Snapshot is unavailable.
 */
function buildFallbackPrompt(newsContext: string): string {
    return `You are FanVise, a fantasy sports expert and strategic consigliere.
Your goal is to provide elite, data-driven advice tailored to the user's specific context.

${newsContext ? `Recent News & Intelligence:\n${newsContext}\n` : ''}

INSTRUCTIONS:
1. Be concise, strategic, and authoritative.
2. Use the provided news context to inform your answers about player status or performance.
3. If specific league context is missing, acknowledge it and provide general guidance.
4. Maintain your role as a knowledgeable fantasy sports advisor.`;
}
