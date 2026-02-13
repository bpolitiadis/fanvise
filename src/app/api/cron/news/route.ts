import { NextResponse } from "next/server";
import { fetchAndIngestNews } from "@/services/news.service";

export async function GET() {
    try {
        // Optional: Add secret key check for security
        // const authHeader = req.headers.get('authorization');
        // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        //     return new NextResponse('Unauthorized', { status: 401 });
        // }

        const count = await fetchAndIngestNews();
        return NextResponse.json({ success: true, count });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        console.error("News ingestion failed:", error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
