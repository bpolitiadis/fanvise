import { NextResponse } from "next/server";
import { fetchAndIngestPlayerStatusesFromLeague } from "@/services/player-status.service";

export async function POST() {
    try {
        const count = await fetchAndIngestPlayerStatusesFromLeague();
        return NextResponse.json({
            success: true,
            count,
            mode: "league-player-status",
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
