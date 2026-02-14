import { NextResponse } from "next/server";
import { fetchAndIngestNews } from "@/services/news.service";

const toSafeCronLimit = (value: string | undefined) => {
    const parsed = Number(value ?? "12");
    if (!Number.isFinite(parsed)) return 12;
    return Math.min(25, Math.max(1, Math.floor(parsed)));
};

const ALLOWED_NEWS_CRON_HOURS_UTC = [11, 22];
const ALLOWED_NEWS_CRON_WINDOW_MINUTES = 20;

const isWithinAllowedNewsWindowUtc = (date: Date): boolean => {
    const currentMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return ALLOWED_NEWS_CRON_HOURS_UTC.some((hour) => {
        const targetMinutes = hour * 60;
        return Math.abs(currentMinutes - targetMinutes) <= ALLOWED_NEWS_CRON_WINDOW_MINUTES;
    });
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

        const now = new Date();
        if (!isWithinAllowedNewsWindowUtc(now)) {
            return NextResponse.json({
                success: true,
                skipped: true,
                reason: "News cron is restricted to 11:00 and 22:00 UTC windows.",
                currentUtcTime: now.toISOString(),
                allowedHoursUtc: ALLOWED_NEWS_CRON_HOURS_UTC,
                windowMinutes: ALLOWED_NEWS_CRON_WINDOW_MINUTES,
            });
        }

        const limit = toSafeCronLimit(process.env.NEWS_CRON_LIMIT);
        const count = await fetchAndIngestNews([], limit);

        return NextResponse.json({
            success: true,
            count,
            limit,
            mode: "news-only",
            allowedHoursUtc: ALLOWED_NEWS_CRON_HOURS_UTC,
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        console.error("[Cron News] ingestion failed:", error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
