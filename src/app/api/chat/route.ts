import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt, contextFromSnapshot } from "@/prompts";
import type { SupportedLanguage } from "@/prompts/types";
import { generateStreamingResponse, type ChatMessage } from "@/services/ai.service";
import { buildIntelligenceSnapshot } from "@/services/league.service";
import { searchNews } from "@/services/news.service";

interface NewsItem {
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    published_at?: string | null;
    source?: string | null;
    player_name?: string | null;
}

interface RequestMessage {
    role: "user" | "assistant";
    content: string;
}

interface ChatRequestBody {
    messages: RequestMessage[];
    activeTeamId?: string | null;
    activeLeagueId?: string | null;
    language?: SupportedLanguage;
}

const isRateLimitError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    return error.message.includes("429");
};

/**
 * Chat API Route
 * 
 * Handles streaming chat responses using the centralized Prompt Engine
 * and Intelligence Snapshot system.
 */
export async function POST(req: NextRequest) {
    try {
        const { messages, activeTeamId, activeLeagueId, language = 'en' } =
            (await req.json()) as ChatRequestBody;
        const lastMessage = messages[messages.length - 1];

        // 1. Fetch News Context (RAG)
        let newsContext = "";
        try {
            const newsItems = await searchNews(lastMessage.content);
            if (newsItems && newsItems.length > 0) {
                newsContext = newsItems
                    .map((item: any) => {
                        const typedItem = item as NewsItem;
                        const sourceTag = typedItem.source ? ` [SOURCE: ${typedItem.source}]` : '';
                        const playerTag = typedItem.player_name ? ` [PLAYER: ${typedItem.player_name}]` : '';
                        return `- [${typedItem.published_at || 'Recent'}]${sourceTag}${playerTag} ${typedItem.title || "News"}: ${typedItem.summary || typedItem.content || ""}`;
                    })
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
                systemInstruction = buildFallbackPrompt(newsContext, language);
            }
        } else {
            console.warn("[Chat API] No active perspective (team/league ID) provided");
            systemInstruction = buildFallbackPrompt(newsContext, language);
        }

        // 3. Convert history to service format
        const history: ChatMessage[] = messages.slice(0, -1).map((m) => ({
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

/**
 * Builds a minimal fallback prompt when Intelligence Snapshot is unavailable.
 */
function buildFallbackPrompt(newsContext: string, language: SupportedLanguage): string {
    const languageInstruction =
        language === 'el'
            ? "Respond in Greek, while keeping core basketball/fantasy terminology in English when that is clearer."
            : "Respond in English.";

    return `You are FanVise, a fantasy sports expert and strategic consigliere.
Your goal is to provide elite, data-driven advice tailored to the user's specific context.

${newsContext ? `Recent News & Intelligence:\n${newsContext}\n` : ''}

INSTRUCTIONS:
0. ${languageInstruction}
1. Be concise, strategic, and authoritative.
2. Use the provided news context to inform your answers about player status or performance.
3. If specific league context is missing, acknowledge it and provide general guidance.
4. Maintain your role as a knowledgeable fantasy sports advisor.`;
}
