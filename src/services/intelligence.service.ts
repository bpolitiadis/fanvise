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
    id?: string | null;
    title?: string | null;
    url?: string | null;
    summary?: string | null;
    content?: string | null;
    published_at?: string | null;
    source?: string | null;
    player_name?: string | null;
    trust_level?: number | null;
    injury_status?: string | null;
    is_injury_report?: boolean | null;
    expected_return_date?: string | null;
    similarity?: number | null;
}

export interface IntelligenceOptions {
    activeTeamId?: string | null;
    activeLeagueId?: string | null;
    language?: SupportedLanguage;
    prefetchedNewsItems?: unknown[];
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
    const { activeTeamId, activeLeagueId, language = 'en', prefetchedNewsItems } = options;
    const hasPerspective = Boolean(activeTeamId && activeLeagueId);

    const newsPromise = prefetchedNewsItems
        ? Promise.resolve(prefetchedNewsItems)
        : searchNews(currentMessage);

    const snapshotPromise = hasPerspective
        ? buildIntelligenceSnapshot(activeLeagueId as string, activeTeamId as string)
        : Promise.resolve(null);

    const [newsResult, snapshotResult] = await Promise.allSettled([
        newsPromise,
        snapshotPromise,
    ]);

    // 1. Fetch News Context (RAG)
    const toNewsItem = (item: unknown): NewsItem => {
        if (!item || typeof item !== "object") return {};
        const record = item as Record<string, unknown>;
        return {
            id: typeof record.id === "string" ? record.id : null,
            title: typeof record.title === "string" ? record.title : null,
            url: typeof record.url === "string" ? record.url : null,
            summary: typeof record.summary === "string" ? record.summary : null,
            content: typeof record.content === "string" ? record.content : null,
            published_at: typeof record.published_at === "string" ? record.published_at : null,
            source: typeof record.source === "string" ? record.source : null,
            player_name: typeof record.player_name === "string" ? record.player_name : null,
            trust_level: typeof record.trust_level === "number" ? record.trust_level : null,
            injury_status: typeof record.injury_status === "string" ? record.injury_status : null,
            is_injury_report: typeof record.is_injury_report === "boolean" ? record.is_injury_report : null,
            expected_return_date: typeof record.expected_return_date === "string" ? record.expected_return_date : null,
            similarity: typeof record.similarity === "number" ? record.similarity : null,
        };
    };

    let newsContext = "";
    if (newsResult.status === "fulfilled" && Array.isArray(newsResult.value) && newsResult.value.length > 0) {
        const seenUrls = new Set<string>();
        const orderedItems = newsResult.value
            .map(item => toNewsItem(item))
            .filter(item => {
                if (!item.url) return true;
                if (seenUrls.has(item.url)) return false;
                seenUrls.add(item.url);
                return true;
            })
            .sort((a, b) => {
                const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
                const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
                return bTime - aTime;
            });

        newsContext = orderedItems
            .map((typedItem) => {
                const sourceTag = typedItem.source ? ` [SOURCE: ${typedItem.source}]` : '';
                const playerTag = typedItem.player_name ? ` [PLAYER: ${typedItem.player_name}]` : '';
                const statusTag = typedItem.injury_status ? ` [STATUS: ${typedItem.injury_status}]` : '';
                const trustTag = typeof typedItem.trust_level === "number" ? ` [TRUST: ${typedItem.trust_level}/5]` : '';
                const similarityTag = typeof typedItem.similarity === "number" ? ` [SIM: ${typedItem.similarity.toFixed(2)}]` : '';
                const returnTag = typedItem.expected_return_date ? ` [RETURN: ${typedItem.expected_return_date}]` : '';
                const injuryTag = typedItem.is_injury_report ? ' [INJURY_REPORT: true]' : '';
                const description = (typedItem.summary || typedItem.content || "").substring(0, 280);
                const urlLine = typedItem.url ? `\n  Source URL: ${typedItem.url}` : '';
                return `- [${typedItem.published_at || 'Recent'}]${sourceTag}${playerTag}${statusTag}${trustTag}${similarityTag}${returnTag}${injuryTag} ${typedItem.title || "News"}: ${description}${description.length === 280 ? '...' : ''}${urlLine}`;
            })
            .join("\n");
    } else if (newsResult.status === "rejected") {
        console.error("[Intelligence Service] Failed to fetch news:", newsResult.reason);
    }

    // 2. Build Intelligence Snapshot & System Prompt
    let systemInstruction = "";

    if (hasPerspective) {
        try {
            if (snapshotResult.status !== "fulfilled" || !snapshotResult.value) {
                throw snapshotResult.status === "rejected"
                    ? snapshotResult.reason
                    : new Error("Snapshot returned empty result");
            }

            const snapshot = snapshotResult.value;
            console.log(`[Intelligence Service] Snapshot ready for League ${activeLeagueId}, Team ${activeTeamId}`);

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
        } catch (snapshotError: unknown) {
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
3. For injury/availability claims, require (player, status, timestamp, source). If any field is missing, say: "Insufficient verified status data."
4. If conflicting statuses appear, prefer the newest timestamp; if tied, prefer higher trust source.
5. ${systemNotice ? "Explicitly mention that you are currently providing general NBA advice because the user's specific league data could not be loaded." : "If specific league context is missing, acknowledge it and provide general NBA guidance."}
6. Maintain your role as a knowledgeable NBA/Fantasy Basketball advisor.
7. ${languageInstruction}`;
}
