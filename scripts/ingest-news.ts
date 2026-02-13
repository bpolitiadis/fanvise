
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local if it exists
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
    console.log("Loading .env.local");
    dotenv.config({ path: envLocalPath });
} else {
    console.log("Loading .env");
    dotenv.config();
}

async function run() {
    console.log("Starting manual ingestion...");
    try {
        // Dynamic import to ensure env vars are loaded before service initialization
        const { fetchAndIngestNews } = await import('../src/services/news.service');
        const count = await fetchAndIngestNews();
        console.log(`Ingestion finished. Count: ${count}`);
    } catch (error) {
        console.error("Ingestion failed:", error);
        process.exit(1);
    }
}

run();
