/**
 * FanVise Intelligence Service
 * 
 * Orchestrates the "Brain" of the application.
 * Responsibilities:
 * 1. Gather Intelligence (RAG News Search).
 * 2. Build Context (League/Team Snapshots).
 * 3. Construct System Prompts (using Prompt Engine).
 * 4. Generate AI Responses.
 * 
 * This service acts as the bridge between the raw data services and the AI models.
 * 
 * @module services/intelligence
 */

import { getSystemPrompt, contextFromSnapshot } from "@/prompts";
import type { SupportedLanguage } from "@/types/ai";
import { generateStreamingResponse } from "@/services/ai.service";
import type { ChatMessage } from "@/types/ai";
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

export interface IntelligenceOptions {
    activeTeamId?: string | null;
    activeLeagueId?: string | null;
    language?: SupportedLanguage;
}

/**
 * Orchestrates a streaming chat response.
 * 
 * @param messages - The conversation history
 * @param options - Contextual options (team, league, language)
 * @returns A streaming response from the AI
 */
export async function generateStrategicResponse(
    history: ChatMessage[],
    currentMessage: string,
    options: IntelligenceOptions = {}
) {
    const { activeTeamId, activeLeagueId, language = 'en' } = options;

    // 1. Fetch News Context (RAG)
    let newsContext = "";
    try {
        const newsItems = await searchNews(currentMessage);
        if (newsItems && newsItems.length > 0) {
            newsContext = newsItems
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((item: any) => {
                    const typedItem = item as NewsItem;
                    const sourceTag = typedItem.source ? ` [SOURCE: ${typedItem.source}]` : '';
                    const playerTag = typedItem.player_name ? ` [PLAYER: ${typedItem.player_name}]` : '';
                    const description = (typedItem.summary || typedItem.content || "").substring(0, 300);
                    return `- [${typedItem.published_at || 'Recent'}]${sourceTag}${playerTag} ${typedItem.title || "News"}: ${description}${description.length === 300 ? '...' : ''}`;
                })
                .join("\n");
        }
    } catch (newsError) {
        console.error("[Intelligence Service] Failed to fetch news:", newsError);
    }

    // 2. Build Intelligence Snapshot & System Prompt
    let systemInstruction = "";

    if (activeTeamId && activeLeagueId) {
        try {
            console.log(`[Intelligence Service] Building snapshot for League ${activeLeagueId}, Team ${activeTeamId}`);
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
                    freeAgents: snapshot.freeAgents,
                },
                language,
                newsContext ? `Recent News & Intelligence:\n${newsContext}` : undefined
            );

            // Generate system prompt using the Prompt Engine
            systemInstruction = getSystemPrompt('orchestrator', promptContext);

            // Diagnostic: Log prompt size to help debug token-limit issues with smaller models
            console.log(`[Intelligence Service] System prompt size: ${systemInstruction.length} chars (~${Math.ceil(systemInstruction.length / 4)} tokens)`);
            console.log(`[Intelligence Service] Context built successfully: League[${snapshot.league.name}] Team[${snapshot.myTeam.name}] News[${newsContext.length > 0}]`);
        } catch (snapshotError) {
            console.error("[Intelligence Service] CRITICAL: Failed to build intelligence snapshot.");
            // Enhanced logging for debugging
            if (snapshotError instanceof Error) {
                console.error(`[Intelligence Service] Error Name: ${snapshotError.name}`);
                console.error(`[Intelligence Service] Error Message: ${snapshotError.message}`);
                console.error(`[Intelligence Service] Stack: ${snapshotError.stack}`);
                // Often caused by RLS or network, log context
                console.error(`[Intelligence Service] Context - League: ${activeLeagueId}, Team: ${activeTeamId}`);
            } else {
                console.error(`[Intelligence Service] Unknown Error: ${JSON.stringify(snapshotError)}`);
            }
            // Fall back to basic prompt with error context
            const errorMessage = snapshotError instanceof Error ? snapshotError.message : 'Unknown';
            systemInstruction = buildFallbackPrompt(newsContext, language, `[SYSTEM NOTICE: League context failed - ${errorMessage}]`);
        }
    } else {
        console.warn(`[Intelligence Service] No active perspective provided. Falling back to generic intelligence.`);
        systemInstruction = buildFallbackPrompt(newsContext, language);
    }

    // 3. Generate streaming response
    return generateStreamingResponse(
        history,
        currentMessage,
        { systemInstruction }
    );
}

/**
 * Builds a minimal fallback prompt when Intelligence Snapshot is unavailable.
 */
function buildFallbackPrompt(newsContext: string, language: SupportedLanguage, systemNotice?: string): string {
    const languageInstruction =
        language === 'el'
            ? "Respond in Greek, while keeping core basketball/fantasy terminology in English when that is clearer."
            : "Respond in English.";

    return `You are the FanVise Strategist, a data-obsessed NBA fanatic and fantasy basketball expert.
Your goal is to provide elite, data-driven advice specifically for NBA Fantasy leagues.

STRICT SCOPE: You are a localized NBA intelligence engine. You MUST IGNORE all other sports (NFL, MLB, etc.). If you do not have data for a specific NBA player, do NOT invent it.

${systemNotice ? `${systemNotice}\n` : ''}
${newsContext ? `Recent NBA News & Intelligence:\n${newsContext}\n` : ''}

INSTRUCTIONS:
1. Be concise, strategic, and authoritative.
2. ZERO SPECULATION: Only use provided news context for player status. Do NOT invent player rosters.
3. ${systemNotice ? "Explicitly mention that you are currently providing general NBA advice because the user's specific league data could not be loaded." : "If specific league context is missing, acknowledge it and provide general NBA guidance."}
4. Maintain your role as a knowledgeable NBA/Fantasy Basketball advisor.
5. ${languageInstruction}`;
}
