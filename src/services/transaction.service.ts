"use server";

import { createClient } from '@/utils/supabase/server';
import { EspnClient } from '@/lib/espn/client';

export async function getLatestTransactions(leagueId: string, limit = 5) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('league_transactions')
        .select('*')
        .eq('league_id', leagueId)
        .order('published_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching transactions:", error);
        return [];
    }
    return data;
}

export async function fetchAndSyncTransactions(leagueId: string, year: string, sport: string) {
    console.log(`Syncing transactions for league ${leagueId}...`);
    const supabase = await createClient();

    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    const client = new EspnClient(leagueId, year, sport, swid, s2);

    // 1. Fetch from ESPN using the client which handles CORS (since it's on server) and cookies
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTransactions2`;
    console.log(`Fetching transactions from: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "FanVise/1.0",
                "Cookie": swid && s2 ? `swid=${swid}; espn_s2=${s2};` : ""
            },
            next: { revalidate: 0 } // Don't cache for sync
        });

        if (!response.ok) {
            console.error(`ESPN Transactions API Error: ${response.status}`);
            return 0;
        }

        const data = await response.json();
        const transactions = data.transactions || [];

        let newCount = 0;

        // Types of transactions to include
        const includeTypes = ['FREEAGENT', 'WAIVER', 'TRADE', 'ROSTER'];

        for (const tx of transactions) {
            // Filter: Ignore LINEUP and FUTURE_ROSTER completely
            if (tx.type === 'LINEUP' || tx.type === 'FUTURE_ROSTER') continue;

            // If it's ROSTER, only count if it has an ADD or DROP item
            if (tx.type === 'ROSTER') {
                const hasRosterMove = tx.items?.some((item: any) => ['ADD', 'DROP', 'WAIVER'].includes(item.type));
                if (!hasRosterMove) continue;
            }

            // Robust date extraction with fallbacks
            const rawTimestamp = tx.processDate || tx.proposedDate || tx.bidDate || tx.date || Date.now();
            const txDate = new Date(rawTimestamp);

            // Final safety check to prevent toISOString() from throwing
            const safePublishedAt = isNaN(txDate.getTime()) ? new Date().toISOString() : txDate.toISOString();

            // Construct a better description if ESPN's is missing
            let description = tx.description;
            if (!description && tx.items) {
                // Basic fallback description
                const adds = tx.items.filter((i: any) => i.type === 'ADD').length;
                const drops = tx.items.filter((i: any) => i.type === 'DROP').length;
                description = `${tx.type}: ${adds} add, ${drops} drop`;
            }

            const { error } = await supabase
                .from('league_transactions')
                .upsert({
                    league_id: leagueId,
                    espn_transaction_id: String(tx.id),
                    type: tx.type,
                    description: description || `${tx.type} transaction`,
                    published_at: safePublishedAt,
                }, { onConflict: 'espn_transaction_id' });

            if (!error) newCount++;
        }

        console.log(`Sync complete. Processed ${transactions.length} transactions, ${newCount} upserted.`);
        return newCount;

    } catch (error) {
        console.error("Failed to sync transactions:", error);
        throw error;
    }
}
