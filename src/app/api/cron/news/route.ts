import { NextResponse } from "next/server";
import { fetchAndIngestNews } from "@/services/news.service";
import { fetchAndIngestPlayerStatusesFromLeague } from "@/services/player-status.service";

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
        return NextResponse.json({ success: true, count, playerStatusCount, limit });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        console.error("[Cron News] ingestion failed:", error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
