import { NextResponse } from "next/server";
import { fetchAndIngestNews } from "@/services/news.service";
import { fetchAndIngestPlayerStatusesFromLeague } from "@/services/player-status.service";
import { syncDailyLeadersForDate } from "@/services/daily-leaders.service";

const toSafeCronLimit = (value: string | undefined) => {
    const parsed = Number(value ?? "12");
    if (!Number.isFinite(parsed)) return 12;
    return Math.min(25, Math.max(1, Math.floor(parsed)));
};

export async function GET(req: Request) {
    try {
        // Restrict worker-like cron ingestion to production deployments only.
        if (process.env.VERCEL_ENV !== "production") {
            return NextResponse.json({
                success: true,
                skipped: true,
                reason: "Cron ingestion runs only in production.",
            });
        }

        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
            const authHeader = req.headers.get("authorization");
            if (authHeader !== `Bearer ${cronSecret}`) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const limit = toSafeCronLimit(process.env.NEWS_CRON_LIMIT);
        const count = await fetchAndIngestNews([], limit);
        const playerStatusCount = await fetchAndIngestPlayerStatusesFromLeague();

        const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
        const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID;
        const leadersResult =
            leagueId && seasonId
                ? await syncDailyLeadersForDate(leagueId, seasonId)
                : null;

        return NextResponse.json({
            success: true,
            count,
            playerStatusCount,
            leadersSynced: leadersResult?.count ?? 0,
            leadersScoringPeriodId: leadersResult?.scoringPeriodId ?? null,
            leadersPeriodDate: leadersResult?.periodDate ?? null,
            limit,
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        console.error("[Cron News] ingestion failed:", error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
