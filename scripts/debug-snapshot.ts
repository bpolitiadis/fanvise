import * as dotenv from 'dotenv';
import { EspnClient } from '../src/lib/espn/client';
import { buildIntelligenceSnapshot } from '../src/services/league.service';

dotenv.config({ path: '.env.local' });

async function debug() {
    console.log("Starting diagnostic roster check...");

    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID!;
    const teamId = "13"; // Updated to Christos Koutoulas's team ID

    try {
        console.log(`Building snapshot for League: ${leagueId}, Team: ${teamId}`);
        const snapshot = await buildIntelligenceSnapshot(leagueId, teamId);

        console.log("--- RESULTS ---");
        console.log(`League: ${snapshot.league.name}`);
        console.log(`My Team: ${snapshot.myTeam.name} (${snapshot.myTeam.manager})`);
        console.log(`My Roster Count: ${snapshot.myTeam.roster?.length || 0}`);

        if (snapshot.myTeam.roster && snapshot.myTeam.roster.length > 0) {
            console.log("First 3 players:");
            snapshot.myTeam.roster.slice(0, 3).forEach(p => {
                console.log(` - ${p.fullName} (${p.position}) [${p.injuryStatus}]`);
            });
        } else {
            console.error("CRITICAL ERROR: Roster is empty!");
        }

    } catch (error) {
        console.error("Snapshot build failed:", error);
    }
}

debug();
