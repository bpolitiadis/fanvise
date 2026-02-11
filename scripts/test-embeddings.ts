import { getServiceStatus, getEmbedding } from '../src/services/ai.service';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyEmbeddings() {
    console.log('--- AI Service Status ---');
    const status = getServiceStatus();
    console.log(JSON.stringify(status, null, 2));

    console.log('\n--- Testing Embedding Generation ---');
    const testText = 'The Los Angeles Lakers are playing a game against the Golden State Warriors.';

    try {
        console.log(`Generating embedding for: "${testText}"`);
        console.log(`Using provider: ${process.env.EMBEDDING_PROVIDER || 'gemini'}`);

        const startTime = Date.now();
        const embedding = await getEmbedding(testText);
        const duration = Date.now() - startTime;

        console.log('✅ Success!');
        console.log(`Vector Size: ${embedding.length}`);
        console.log(`Time taken: ${duration}ms`);
        console.log('First 5 values:', embedding.slice(0, 5));

        if (embedding.length === 0) {
            console.error('❌ Error: Embedding is empty');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Verification Failed:', error);
        process.exit(1);
    }
}

verifyEmbeddings();
