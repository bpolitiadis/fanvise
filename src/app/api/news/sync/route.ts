import { NextRequest, NextResponse } from "next/server";
import { fetchAndIngestNews } from "@/services/news.service";
import { EspnClient } from "@/lib/espn/client";
import type { EspnTeam } from "@/lib/espn/types";

interface EspnRosterEntryLite {
    playerPoolEntry?: {
        player?: {
            fullName?: string;
        };
    };
}

export async function POST(req: NextRequest) {
    try {
        const { leagueId, teamId, backfill, limit, dryRun } = await req.json();
        const watchlist: string[] = [];

        if (leagueId && teamId) {
            console.log(`[Sync API] Gathering watchlist for league ${leagueId}, team ${teamId}`);
            try {
                const year = new Date().getFullYear().toString();
                const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';
                const swid = process.env.ESPN_SWID;
                const s2 = process.env.ESPN_S2;

                const espnClient = new EspnClient(leagueId, year, sport, swid, s2);
                const leagueData = await espnClient.getLeagueSettings();
                const myTeam = leagueData.teams?.find((t: EspnTeam) => String(t.id) === String(teamId));

                const roster = myTeam?.roster || myTeam?.rosterForCurrentScoringPeriod;
                if (roster?.entries) {
                    roster.entries.forEach((entry: EspnRosterEntryLite) => {
                        const name = entry.playerPoolEntry?.player?.fullName;
                        if (name) watchlist.push(name);
                    });
                }
                console.log(`[Sync API] Found ${watchlist.length} rostered players for watchlist`);
            } catch (err) {
                console.error("[Sync API] Failed to fetch roster for watchlist:", err);
            }
        }

        let count = 0;
        if (backfill) {
            console.log("[Sync API] Triggering Historical Backfill...");
            const { backfillNews } = await import("@/services/news.service");
            count = await backfillNews(watchlist, 3); // Default 3 pages
        } else {
            // Use provided limit or default (will be 50 in service)
            // If limit is provided, ensure it's a number
            const ingestionLimit = typeof limit === 'number' ? limit : undefined;
            count = await fetchAndIngestNews(watchlist, ingestionLimit, dryRun);
        }

        return NextResponse.json({ success: true, count, watchlistSize: watchlist.length, backfill: !!backfill });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal server error during sync";
        console.error("[Sync API] Critical error:", errorMessage);
        return NextResponse.json({
            success: false,
            error: errorMessage,
            count: 0
        }, { status: 500 });
    }
}
