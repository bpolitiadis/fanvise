import { NextRequest, NextResponse } from "next/server";
import { fetchAndIngestNews } from "@/lib/services/news-service";

export async function GET(req: NextRequest) {
    try {
        // Optional: Add secret key check for security
        // const authHeader = req.headers.get('authorization');
        // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        //     return new NextResponse('Unauthorized', { status: 401 });
        // }

        const count = await fetchAndIngestNews();
        return NextResponse.json({ success: true, count });
    } catch (error: any) {
        console.error("News ingestion failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
