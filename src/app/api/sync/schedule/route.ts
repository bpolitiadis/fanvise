import { NextResponse } from "next/server";
import { ScheduleService } from "@/services/schedule.service";

export async function POST() {
    try {
        const year = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || "2024";

        console.log(`[API] Syncing NBA Schedule for season ${year}...`);

        const service = new ScheduleService();
        const count = await service.syncSchedule(year);

        return NextResponse.json({
            success: true,
            message: `Synced ${count} NBA games for season ${year}`,
            count
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        console.error("[API] Schedule Sync Error:", error);
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
