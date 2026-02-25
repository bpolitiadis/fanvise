async function probeEspnPlayerNews(playerId: string) {
    console.log(`Probing ESPN News APIs for player ID: ${playerId}\n`);

    const endpoints = [
        `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/overview`
    ];

    for (const url of endpoints) {
        console.log(`Testing: ${url}`);
        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`Success! Payload size: ${JSON.stringify(data).length} bytes`);
                if (Array.isArray(data.news)) {
                    console.log(`Found ${data.news.length} news items.`);
                    data.news.slice(0, 5).forEach((item: any, i: number) => {
                        console.log(`[${i}] ${item.headline} (${item.lastModified || item.published})`);
                    });
                } else {
                    console.log("Keys in payload:", Object.keys(data));
                    if (data.athlete) console.log("Keys in athlete:", Object.keys(data.athlete));
                }
            } else {
                console.log(`Failed with status ${res.status}`);
            }
        } catch (e: any) {
            console.log(`Error fetching: ${e.message}`);
        }
        console.log("------------------------\n");
    }
}

probeEspnPlayerNews("3118"); // Kristaps Porzingis
