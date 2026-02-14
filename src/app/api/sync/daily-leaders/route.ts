import { NextRequest, NextResponse } from "next/server";
import { syncDailyLeadersForDate } from "@/services/daily-leaders.service";

export async function POST(req: NextRequest) {
  try {
    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
    const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID;

    if (!leagueId || !seasonId) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_ESPN_LEAGUE_ID or NEXT_PUBLIC_ESPN_SEASON_ID" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const date = dateParam ? new Date(dateParam) : undefined;
    if (dateParam && Number.isNaN(date?.getTime())) {
      return NextResponse.json(
        { error: "Invalid date query param. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const result = await syncDailyLeadersForDate(leagueId, seasonId, date);
    if (!result) {
      return NextResponse.json(
        { error: "Could not resolve scoring period for the requested date." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${result.count} daily leaders for ${result.periodDate} (scoring period ${result.scoringPeriodId}).`,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
