import { NextRequest, NextResponse } from "next/server";
import { EspnClient } from "@/lib/espn/client";
import { upsertLeague } from "@/services/league.service";

export async function POST(req: NextRequest) {
    try {
        const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID!;
        const year = process.env.NEXT_PUBLIC_ESPN_SEASON_ID!;
        const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "ffl";
        const swid = process.env.ESPN_SWID;
        const s2 = process.env.ESPN_S2;

        if (!leagueId || !year) {
            return NextResponse.json(
                { error: "Missing League ID or Season ID in env" },
                { status: 400 }
            );
        }

        console.log("Sync Debug:");
        console.log(`- League ID: ${leagueId}`);
        console.log(`- Sport: ${sport}`);
        console.log(`- SWID Present: ${!!swid}, Length: ${swid?.length}`);
        console.log(`- S2 Present: ${!!s2}, Length: ${s2?.length}`);

        const client = new EspnClient(leagueId, year, sport, swid, s2);

        // 1. Fetch Settings
        const data = await client.getLeagueSettings();

        // 2. Parse Data
        // ESPN API structure varies, but generally:
        // data.settings.name
        // data.settings.scoringSettings
        // data.settings.rosterSettings

        const settings = data.settings || {};
        const name = settings.name || `League ${leagueId}`;
        const scoringSettings = settings.scoringSettings || {};
        const rosterSettings = settings.rosterSettings || {};



        const draftDetail = data.draftDetail || {};
        const positionalRatings = data.positionalRatings || {};
        const liveScoring = data.liveScoring || {};

        // Extract teams
        // data.teams usually contains the team info
        // data.members usually contains the manager info
        // We'll map them to a clean format
        const teams = (data.teams || []).map((t: any) => {
            const member = (data.members || []).find((m: any) => m.id === t.owners?.[0]);
            return {
                id: String(t.id),
                name: t.name || `${t.location} ${t.nickname}`,
                abbrev: t.abbrev,
                logo: t.logo,
                wins: t.record?.overall?.wins,
                losses: t.record?.overall?.losses,
                ties: t.record?.overall?.ties,
                manager: member ? `${member.firstName} ${member.lastName}` : "Unknown"
            };
        });

        // 3. Upsert to DB
        await upsertLeague(leagueId, year, name, scoringSettings, rosterSettings, teams, draftDetail, positionalRatings, liveScoring);

        return NextResponse.json({
            success: true,
            message: `Synced league: ${name}`,
            data: { name, seasonId: year }
        });

    } catch (error: any) {
        console.error("Sync error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
