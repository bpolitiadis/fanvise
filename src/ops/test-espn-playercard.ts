import "dotenv/config";
import { EspnClient } from "../lib/espn/client";
import { extractPlayerCardData } from "../services/news.service";

async function testEspnPlayerCard() {
    console.log("=== Testing ESPN Player Card Fetch ===");

    // Use default test environment variables or process.env if available
    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID || "13001";
    const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || 2026;
    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    const client = new EspnClient(leagueId, String(seasonId), sport, swid, s2);

    // Let's test a few players known to have news/injuries
    // Kristaps Porzingis: 3118
    // Tyrese Maxey: 4395625
    // LeBron James: 1966

    const testCases = [
        { name: "Kristaps Porziņģis", id: 3118 },
        { name: "Devin Booker", id: 3136193 },
    ];

    for (const player of testCases) {
        console.log(`\nFetching ${player.name} (${player.id})...`);
        try {
            const cardData = await client.getPlayerCard(player.id);
            const players = Array.isArray(cardData?.players) ? cardData.players : [];
            const playerObj = (players[0]?.player ?? {}) as Record<string, unknown>;

            console.log("\n--- Player Object Keys ---");
            console.log(Object.keys(playerObj));

            console.log("Raw ESPN Last News Date:", playerObj.lastNewsDate);
            console.log("Raw ESPN seasonOutlook snippet:", String(playerObj.seasonOutlook || "").substring(0, 100) + "...");
            console.log("Raw ESPN injuryStatus:", playerObj.injuryStatus);

            const extracted = extractPlayerCardData(player.name, player.id, playerObj);

            if (extracted) {
                console.log("\n✅ Extracted Data Successfully:");
                console.log(JSON.stringify(extracted, null, 2));

                // Print what the news item content would look like
                let contentBody = [];
                if (extracted.injuryStatus) contentBody.push(`Injury Status: ${extracted.injuryStatus}${extracted.injuryType ? ` (${extracted.injuryType})` : ''}.`);
                if (extracted.expectedReturnDate) contentBody.push(`Expected Return: ${extracted.expectedReturnDate}.`);
                if (extracted.seasonOutlook) contentBody.push(extracted.seasonOutlook);
                console.log("\n📰 Simulated DB Content:");
                console.log(contentBody.join(" ").substring(0, 300) + "...");
            } else {
                console.log("\n❌ Failed to extract any useful news/injury data from player card.");
            }

        } catch (e) {
            console.error(`Failed to fetch ${player.name}:`, e);
        }
    }
    console.log("\n=== Test Complete ===");
}

testEspnPlayerCard();
