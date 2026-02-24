/**
 * Smoke test for the full player news pipeline:
 *   1. searchNewsWithLiveFetch  — DB + live RSS in parallel
 *   2. extractPlayerCardData + ingestPlayerCardData — ESPN playercard injection
 *
 * Run: npx tsx src/ops/test-search-news-live.ts [playerName] [espnPlayerId]
 * Example: npx tsx src/ops/test-search-news-live.ts "Devin Booker" 3136193
 */
import { loadEnv } from './load-env';

const run = async (): Promise<void> => {
    loadEnv();

    const playerName  = process.argv[2] ?? 'Devin Booker';
    const espnPlayerId = process.argv[3] ? Number(process.argv[3]) : 3136193;

    console.log(`\n=== Player News Pipeline smoke test ===`);
    console.log(`Player: "${playerName}"  |  ESPN ID: ${espnPlayerId}\n`);

    const {
        searchNewsWithLiveFetch,
        extractPlayerCardData,
        ingestPlayerCardData,
    } = await import('@/services/news.service');

    // Step 1: Ingest playercard data (ESPN structured injury/outlook)
    console.log('--- Step 1: ESPN playercard ingest ---');
    const { EspnClient } = await import('@/lib/espn/client');
    const client = new EspnClient(
        process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID!,
        process.env.NEXT_PUBLIC_ESPN_SEASON_ID ?? '2026',
        process.env.NEXT_PUBLIC_ESPN_SPORT ?? 'fba',
        process.env.ESPN_SWID,
        process.env.ESPN_S2,
    );
    const cardData = await client.getPlayerCard(espnPlayerId);
    const players = Array.isArray(cardData?.players) ? cardData.players as Array<Record<string, unknown>> : [];
    const playerObj = (players[0]?.player ?? {}) as Record<string, unknown>;
    const extracted = extractPlayerCardData(playerName, espnPlayerId, playerObj);

    if (extracted) {
        console.log('Extracted:', {
            injuryStatus: extracted.injuryStatus,
            injuryType: extracted.injuryType,
            expectedReturnDate: extracted.expectedReturnDate,
            lastNewsTimestamp: extracted.lastNewsTimestamp,
            outlookSnippet: extracted.seasonOutlook?.substring(0, 80) + '…',
        });
        const cardStart = Date.now();
        const ingested = await ingestPlayerCardData(extracted);
        console.log(`Ingested: ${ingested}  (${Date.now() - cardStart}ms)\n`);
    } else {
        console.log('Nothing to ingest from playercard (no injury/outlook data)\n');
    }

    // Step 2: Live RSS + DB search
    console.log('--- Step 2: searchNewsWithLiveFetch ---');
    const start = Date.now();
    const { items, newlyIngested } = await searchNewsWithLiveFetch(playerName, 8, { feedTimeoutMs: 8000 });
    const elapsed = Date.now() - start;

    console.log(`Completed in ${elapsed}ms`);
    console.log(`Newly ingested: ${newlyIngested}`);
    console.log(`Articles returned: ${items.length}\n`);

    if (items.length === 0) {
        console.log('No results found. Check that the Rotowire/ESPN RSS feeds are reachable.');
        return;
    }

    for (const [i, item] of items.entries()) {
        const age = item.published_at
            ? Math.round((Date.now() - new Date(item.published_at).getTime()) / (1000 * 60 * 60))
            : null;
        console.log(`[${i + 1}] ${item.title ?? '(no title)'}`);
        console.log(`    Source: ${item.source ?? '?'}  |  Published: ${item.published_at ?? '?'}${age !== null ? ` (${age}h ago)` : ''}`);
        console.log(`    Injury: ${item.injury_status ?? 'none'}  |  Sentiment: ${item.sentiment ?? '?'}`);
        console.log(`    URL: ${item.url ?? '?'}`);
        console.log();
    }
};

void run().catch(e => {
    console.error('[test] Fatal error:', e);
    process.exit(1);
});
