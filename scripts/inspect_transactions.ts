

// import { EspnClient } from '../src/lib/espn/client';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function inspect() {
    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID!;
    const year = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || "2026";
    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTransactions2`;
    console.log(`Fetching from: ${url}`);

    const response = await fetch(url, {
        headers: {
            "Cookie": swid && s2 ? `swid=${swid}; espn_s2=${s2};` : ""
        }
    });

    const data = await response.json();
    const transactions = data.transactions || [];

    console.log(`Found ${transactions.length} transactions`);
    if (transactions.length > 0) {
        console.log("First transaction sample:");
        console.log(JSON.stringify(transactions[0], null, 2));

        console.log("\nTypes found:");
        const types = new Set(transactions.map((t: any) => t.type));
        console.log(Array.from(types));
    }
}

inspect();
