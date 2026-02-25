import { fetchPlayerSpecificNews } from '../services/news.service';

const testLiveFetch = async () => {
    console.log("=== Testing FanVise Live Fetch ===");
    console.log("Testing diacritic stripping and fuzzy matching...");

    try {
        const porzingisResult = await fetchPlayerSpecificNews("Kristaps Porziņģis", { feedTimeoutMs: 15_000 });
        console.log(`\nResults for Kristaps Porziņģis:`);
        console.log(`Newly ingested from RSS: ${porzingisResult.refreshed}`);
        console.log(`Relevant items found: ${porzingisResult.items.length}`);
        if (porzingisResult.items.length > 0) {
            console.log("Sample article match:", porzingisResult.items[0].title);
        }

        const mitchellResult = await fetchPlayerSpecificNews("Ajay Mitchell", { feedTimeoutMs: 15_000 });
        console.log(`\nResults for Ajay Mitchell:`);
        console.log(`Newly ingested from RSS: ${mitchellResult.refreshed}`);
        console.log(`Relevant items found: ${mitchellResult.items.length}`);
        if (mitchellResult.items.length > 0) {
            console.log("Sample article match:", mitchellResult.items[0].title);
        }

        console.log("\n=== Test Complete ===");
    } catch (e) {
        console.error("Test failed:", e);
    }
};

testLiveFetch();
