/**
 * FanVise Transaction Service
 * 
 * Handles the fetching, parsing, and storage of league transactions (adds, drops, trades).
 * This service is critical for the "Market Intelligence" module, allowing the AI to 
 * monitor roster churn and identify potential waiver wire opportunities.
 * 
 * @module services/transaction
 */

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAndSyncTransactions(leagueId: string, year: string, sport: string, existingSupabase?: any) {
    console.log(`Syncing transactions for league ${leagueId}...`);
    const supabase = existingSupabase || await createClient();

    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    const client = new EspnClient(leagueId, year, sport, swid, s2);

    try {
        // 1. Fetch from ESPN using the central client
        const data = await client.getTransactions();
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    const playerName = item.playerPoolEntry?.player?.fullName ||
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
