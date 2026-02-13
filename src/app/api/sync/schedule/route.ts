import { NextRequest, NextResponse } from "next/server";
import { ScheduleService } from "@/services/schedule.service";

export async function POST(req: NextRequest) {
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
    } catch (error: any) {
        console.error("[API] Schedule Sync Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
