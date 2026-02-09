import * as dotenv from 'dotenv';

// Load env vars BEFORE importing the service (which initializes Supabase immediately)
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Running manual news ingestion...");
    // Dynamic import to ensure env vars are loaded
    const { fetchAndIngestNews } = await import('../src/lib/services/news-service');

    try {
        const count = await fetchAndIngestNews();
        console.log(`Successfully ingested ${count} items.`);
    } catch (error) {
        console.error("Ingestion failed:", error);
    }
}

main();
