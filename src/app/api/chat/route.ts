import { NextRequest, NextResponse } from "next/server";
import { generateResponse } from "@/lib/agents/orchestrator";
import { createClient } from "@/utils/supabase/server";
import { getUserLeague, fetchLeagueById, fetchTeamById } from "@/lib/db/leagues";
import { searchNews } from "@/lib/services/news-service";
import { EspnClient } from "@/lib/espn/client";

export async function POST(req: NextRequest) {
    try {
        const { messages, activeTeamId, activeLeagueId, teamName } = await req.json();
        const lastMessage = messages[messages.length - 1];

        // 1. Fetch News Context (RAG)
        let newsContext = "";
        try {
            const newsItems = await searchNews(lastMessage.content);
            if (newsItems && newsItems.length > 0) {
                newsContext = `\n\nRecent News & Intelligence:\n${newsItems.map((item: any) => `- [${item.published_at}] ${item.title}: ${item.summary || item.content}`).join("\n")}`;
            }
        } catch (newsError) {
            console.error("Failed to fetch news:", newsError);
        }

        // 2. Fetch League/Team/Matchup Context (Perspective Engine)
        let leagueContext = "";
        let matchupContext = "";

        if (activeTeamId && activeLeagueId) {
            const league = await fetchLeagueById(activeLeagueId);
            const team = await fetchTeamById(activeTeamId);

            if (league && team) {
                leagueContext = `
Current Perspective via FanVise Perspective Engine:
- Viewing As Team: ${team.manager_name} (Team ID: ${team.team_id})
- League: ${league.name}
- Scoring Rules: ${JSON.stringify(league.scoring_settings, null, 2)}
- Roster Slots: ${JSON.stringify(league.roster_slots, null, 2)}
- Team Info: ${JSON.stringify(team, null, 2)}
`;

                // Fetch Matchup Context
                try {
                    const year = new Date().getFullYear().toString();
                    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "ffl";
                    console.log(`Fetching matchups for ${sport} league ${activeLeagueId}, year ${year}`);

                    const espnClient = new EspnClient(activeLeagueId, year, sport);
                    const matchupData = await espnClient.getMatchups();

                    if (matchupData && matchupData.schedule) {
                        const teamIdNum = parseInt(activeTeamId);
                        const currentMatchup = matchupData.schedule.find((m: any) =>
                            (m.away?.teamId === teamIdNum || m.home?.teamId === teamIdNum)
                        );

                        if (currentMatchup) {
                            const isHome = currentMatchup.home?.teamId === teamIdNum;
                            const myTeamData = isHome ? currentMatchup.home : currentMatchup.away;
                            const opponentData = isHome ? currentMatchup.away : currentMatchup.home;

                            matchupContext = `
Current Weekly Matchup:
- Opponent Team ID: ${opponentData?.teamId}
- Your Score: ${myTeamData?.totalPoints || 0}
- Opponent Score: ${opponentData?.totalPoints || 0}
- Status: ${currentMatchup.winner === 'UNDECIDED' ? 'In Progress' : 'Completed'}
`;
                            console.log("Matchup context successfully generated.");
                        } else {
                            console.warn(`No active matchup found for team ${teamIdNum} in schedule.`);
                        }
                    } else {
                        console.warn("No schedule found in ESPN matchup data.");
                    }
                } catch (matchupError) {
                    console.error("Failed to fetch matchup data:", matchupError);
                }
            } else {
                console.warn(`League ${activeLeagueId} or Team ${activeTeamId} not found in DB.`);
            }
        } else {
            console.warn("No active perspective (team/league ID) provided in request.");
        }

        // Log lengths for debugging
        console.log(`Context status: League[${leagueContext.length}] Matchup[${matchupContext.length}] News[${newsContext.length}]`);

        const systemInstruction = `You are FanVise, a fantasy sports expert and strategic consigliere.
Your goal is to provide elite, data-driven advice tailored to the user's specific context.

${leagueContext}
${matchupContext}
${newsContext}

INSTRUCTIONS:
1. Always prioritize the specific scoring settings provided in the context.
2. If a matchup is in progress, reference the current scores and opponent.
3. Be concise, strategic, and authoritative.
4. Use the provided news RAG context to inform your answers about player status or performance.
5. If information is missing (like a specific player's projection), acknowledge it based on the data you HAVE.`;

        // Convert history (Gemini format)
        const history = messages.slice(0, -1).map((m: any) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
        }));

        // Generate stream using the new orchestrator method with systemInstruction
        const steamResult = await generateResponse(history, lastMessage.content, systemInstruction);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                if (process.env.USE_LOCAL_AI === 'true') {
                    // Ollama parsing
                    const reader = (steamResult as any).getReader();
                    const decoder = new TextDecoder();
                    try {
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
                                } catch (e) {
                                    // Fragmented JSON, skip or buffering could be added for production
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Stream reading error:", err);
                    } finally {
                        controller.close();
                    }
                } else {
                    // Gemini parsing
                    try {
                        for await (const chunk of steamResult as any) {
                            const chunkText = chunk.candidates?.[0].content.parts[0].text;
                            if (chunkText) {
                                controller.enqueue(encoder.encode(chunkText));
                            }
                        }
                    } catch (err) {
                        console.error("Gemini stream error:", err);
                    } finally {
                        controller.close();
                    }
                }
            },
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
            },
        });

    } catch (error: any) {
        console.error("Error in chat route:", error);

        // Relay 429 Too Many Requests
        if (error?.message?.includes('429') || error?.status === 429) {
            return NextResponse.json({
                error: "FanVise is currently high in demand. Please wait a moment before your next strategic inquiry.",
                code: "RATE_LIMIT_EXCEEDED"
            }, { status: 429 });
        }

        return NextResponse.json({ error: error.message || "Unknown Error", stack: error.stack }, { status: 500 });
    }
}
