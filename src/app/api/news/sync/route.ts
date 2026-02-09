import { NextRequest, NextResponse } from "next/server";
import { fetchAndIngestNews } from "@/services/news.service";
import { createClient } from "@/utils/supabase/server";
import { EspnClient } from "@/lib/espn/client";

export async function POST(req: NextRequest) {
    try {
        const { leagueId, teamId, backfill } = await req.json();
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
                const myTeam = leagueData.teams?.find((t: any) => String(t.id) === String(teamId));

                const roster = myTeam?.roster || myTeam?.rosterForCurrentScoringPeriod;
                if (roster?.entries) {
                    roster.entries.forEach((entry: any) => {
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
            count = await fetchAndIngestNews(watchlist);
        }

        return NextResponse.json({ success: true, count, watchlistSize: watchlist.length, backfill: !!backfill });
    } catch (error: any) {
        console.error("[Sync API] Critical error:", error.message);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error during sync",
            count: 0
        }, { status: 500 });
    }
}
