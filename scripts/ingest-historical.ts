import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local BEFORE importing any services
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function ingestHistorical() {
    console.log('🚀 Starting High-Volume Historical Ingestion');

    // Dynamically import service after env is loaded
    const { fetchAndIngestNews } = await import('../src/services/news.service');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Error: Supabase credentials missing');
        process.exit(1);
    }

    console.log(`📡 Targeting Database: ${supabaseUrl}`);
    console.log(`🤖 Embedding Provider: ${process.env.EMBEDDING_PROVIDER || 'gemini'}`);

    try {
        // We will call the existing fetchAndIngestNews but we might want to extend it
        // for deeper history. For now, let's trigger it and monitor.

        console.log('\n--- Syncing News Sources ---');
        // Currently fetchAndIngestNews processes all sources in FEEDS
        const result = await fetchAndIngestNews();

        console.log('\n✅ Ingestion Complete!');
        console.log(`Summary: ${JSON.stringify(result, null, 2)}`);

    } catch (error) {
        console.error('❌ Ingestion Failed:', error);
        process.exit(1);
    }
}

// Check if we are running as a script
if (require.main === module) {
    ingestHistorical();
}
