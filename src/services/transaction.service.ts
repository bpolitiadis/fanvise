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

export async function fetchAndSyncTransactions(leagueId: string, year: string, sport: string, existingSupabase?: any) {
    console.log(`Syncing transactions for league ${leagueId}...`);
    const supabase = existingSupabase || await createClient();

    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    const client = new EspnClient(leagueId, year, sport, swid, s2);

    // 1. Fetch from ESPN using the client which handles CORS (since it's on server) and cookies
    // Add mRoster view to get a complete player lookup table for name resolution
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTransactions2&view=mRoster`;
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

        // Build a global player map from all team rosters for robust name resolution
        const playerMap = new Map<number, string>();
        if (data.teams && Array.isArray(data.teams)) {
            for (const team of data.teams) {
                if (team.roster && team.roster.entries) {
                    for (const entry of team.roster.entries) {
                        const p = entry.playerPoolEntry?.player || entry.player;
                        if (p && p.id && p.fullName) {
                            playerMap.set(p.id, p.fullName);
                        }
                    }
                }
            }
        }

        // 2. Fetch league data for lookup (teams and rosters)
        const { data: leagueData } = await supabase
            .from('leagues')
            .select('teams, roster_settings')
            .eq('league_id', leagueId)
            .single();

        const teams = (leagueData?.teams as any[]) || [];
        const teamMap = new Map(teams.map(t => [String(t.id), t]));

        let newCount = 0;

        for (const tx of transactions) {
            // Filter: Ignore LINEUP and FUTURE_ROSTER completely
            // Also ignore generic ROSTER transactions that don't have enough detail to be useful
            if (tx.type === 'LINEUP' || tx.type === 'FUTURE_ROSTER') continue;

            // If it's a "ROSTER" transaction and description is generic, check if it's worth keeping
            if (tx.type === 'ROSTER' && (!tx.description || tx.description === 'ROSTER transaction') && (!tx.items || tx.items.length === 0)) {
                continue;
            }

            // Robust date extraction with fallbacks
            const rawTimestamp = tx.processDate || tx.proposedDate || tx.bidDate || tx.date || Date.now();
            const txDate = new Date(rawTimestamp);
            const safePublishedAt = isNaN(txDate.getTime()) ? new Date().toISOString() : txDate.toISOString();

            // Enriched description logic
            let description = tx.description;

            // Clean up generic "ROSTER transaction" if it has items
            if (description === 'ROSTER transaction' && tx.items && tx.items.length > 0) {
                description = "";
            }

            if (!description && tx.items && tx.items.length > 0) {
                const teamMoves = new Map<string, string[]>();

                for (const item of tx.items) {
                    const mappedTeamId = item.toTeamId !== -1 ? item.toTeamId : item.fromTeamId;
                    const team = teamMap.get(String(mappedTeamId));
                    const teamName = team?.name || "Unknown Team";

                    // Try to resolve player name using various sources
                    let playerName = item.playerPoolEntry?.player?.fullName ||
                        playerMap.get(item.playerId) ||
                        `Player ${item.playerId}`;

                    let moveDetail = "";
                    if (item.type === 'ADD') {
                        const from = item.fromTeamId === -1 ? "Free Agency" : (teamMap.get(String(item.fromTeamId))?.name || "Waivers");
                        moveDetail = `added ${playerName} from ${from}`;
                    } else if (item.type === 'DROP') {
                        const to = item.toTeamId === -1 ? "Waivers" : "Roster";
                        moveDetail = `dropped ${playerName} to ${to}`;
                    } else if (item.type === 'WAIVER') {
                        moveDetail = `added ${playerName} via Waivers`;
                    } else if (tx.type === 'ROSTER') {
                        moveDetail = `moved ${playerName}`;
                    }

                    if (moveDetail) {
                        if (!teamMoves.has(teamName)) teamMoves.set(teamName, []);
                        teamMoves.get(teamName)!.push(moveDetail);
                    }
                }

                const finalDetails: string[] = [];
                for (const [teamName, moves] of teamMoves.entries()) {
                    if (moves.length > 3) {
                        finalDetails.push(`${teamName}: shifted ${moves.length} players`);
                    } else {
                        finalDetails.push(`${teamName}: ${moves.join(', ')}`);
                    }
                }
                description = finalDetails.join(' | ');
            }

            // Skip if we still don't have a description or if it's still generic
            if (!description || description === 'ROSTER transaction') continue;

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
