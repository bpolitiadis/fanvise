
import { EspnClient } from '../src/lib/espn/client';

async function main() {
    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID || '13001';
    const year = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || '2026';
    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';
    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    const client = new EspnClient(leagueId, year, sport, swid, s2);

    console.log('--- Researching Activity Log (Actual Transactions) ---');
    try {
        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTransactions2`;
        const filter = {
            "transactions": {
                "filterStatus": { "value": ["EXECUTED"] },
                "filterTypes": { "value": ["ADD", "DROP", "TRADE", "WAIVER"] },
                "limit": 5
            }
        };
        const response = await fetch(url, {
            headers: {
                "Cookie": `swid=${swid}; espn_s2=${s2};`,
                "X-Fantasy-Filter": JSON.stringify(filter)
            }
        });
        const activity = await response.json();
        console.log('Transaction Keys:', Object.keys(activity));
        if (activity.transactions) {
            console.log(`Found ${activity.transactions.length} transactions`);
            console.log('Sample Transaction Entry:', JSON.stringify(activity.transactions[0], null, 2));
        }
    } catch (e) {
        console.error('Activity Log Error:', e);
    }

    console.log('\n--- Researching Player Info (Kona) ---');
    try {
        // Broaden the search
        const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${year}/segments/0/leagues/${leagueId}?view=kona_player_info`;

        // Let's try to get just the top 5 players by ownership without complex slot filters
        const filter = {
            "players": {
                "limit": 5,
                "sortPercOwned": { "sortPriority": 1, "sortAscending": false },
                "filterStatsForTopScoringPeriodIds": {
                    "value": [2, 3],
                    "additionalValue": ["002025", "102025", "002024", "112025"]
                }
            }
        };

        const response = await fetch(url, {
            headers: {
                "Cookie": `swid=${swid}; espn_s2=${s2};`,
                "X-Fantasy-Filter": JSON.stringify(filter)
            }
        });
        const data = await response.json();
        if (data.messages) {
            console.log('Error Messages:', data.messages);
        } else {
            console.log('Kona Success! Player count:', data.players?.length);
            if (data.players?.[0]) {
                const p = data.players[0].player;
                console.log('Player Full Name:', p.fullName);
                console.log('Stats length:', p.stats?.length);
                // Look for projected points (usually statSourceId: 1 for projection, 0 for actual)
                const projections = p.stats?.filter((s: any) => s.statSourceId === 1 && s.statSplitTypeId === 1);
                console.log('Projections Sample:', JSON.stringify(projections?.[0], null, 2));
                console.log('Ownership Sample:', JSON.stringify(p.ownership, null, 2));
            }
        }
    } catch (e) {
        console.error('Player Info Error:', e);
    }
}

main();
