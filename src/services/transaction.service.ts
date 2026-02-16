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
export async function fetchAndSyncTransactions(leagueId: string, year: string, sport: string, existingSupabase?: any, injectedClient?: any) {
    console.log(`Syncing transactions for league ${leagueId}...`);
    const supabase = existingSupabase || await createClient();

    const swid = process.env.ESPN_SWID;
    const s2 = process.env.ESPN_S2;

    const client = injectedClient || new EspnClient(leagueId, year, sport, swid, s2);

    try {
        // 1. Fetch from ESPN using the central client
        // Use mTransactions2 to get the latest comprehensive list
        const data = await client.getTransactions();
        const transactions = data.transactions || [];

        // --- ENHANCED TEAM MAPPING ---
        // Build team map primarily from the transaction response itself (data.teams)
        // This is often fresher than the database
        const teamMap = new Map<string, string>();

        // 1a. From ESPN response
        if (data.teams && Array.isArray(data.teams)) {
            data.teams.forEach((t: any) => {
                const name = t.name ||
                    (t.location && t.nickname ? `${t.location} ${t.nickname}` : undefined) ||
                    t.abbrev ||
                    `Team ${t.id}`;
                teamMap.set(String(t.id), name);
            });
        }

        // 1b. Fallback: Fetch from Supabase if map is empty/incomplete
        if (teamMap.size === 0) {
            const { data: leagueData } = await supabase
                .from('leagues')
                .select('teams')
                .eq('league_id', leagueId)
                .single();

            if (leagueData?.teams) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (leagueData.teams as any[]).forEach(t => {
                    teamMap.set(String(t.id), t.name);
                });
            }
        }

        // --- ENHANCED PLAYER MAPPING ---
        // 2a. Initial map from current rosters (available in data.teams if view=mRoster was used)
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

        // 2b. Identify missing players from transactions
        const missingPlayerIds = new Set<number>();
        for (const tx of transactions) {
            if (tx.items) {
                for (const item of tx.items) {
                    const pid = item.playerId;
                    const pName = item.playerPoolEntry?.player?.fullName || playerMap.get(pid);
                    if (!pName && pid > 0) {
                        missingPlayerIds.add(pid);
                    }
                }
            }
        }

        // 2c. Batch fetch missing players
        if (missingPlayerIds.size > 0) {
            console.log(`Transactions reference ${missingPlayerIds.size} unknown players. Fetching details...`);
            const missingPlayers = await client.getPlayerInfo(Array.from(missingPlayerIds));
            missingPlayers.forEach((p: any) => {
                if (p.id && p.fullName) {
                    playerMap.set(p.id, p.fullName);
                }
            });
        }

        let newCount = 0;

        for (const tx of transactions) {
            // Filter: Ignore LINEUP and FUTURE_ROSTER completely
            if (tx.type === 'LINEUP' || tx.type === 'FUTURE_ROSTER') continue;

            // If it's a "ROSTER" transaction and description is generic, check if it's worth keeping
            let isGenericRoster = (tx.type === 'ROSTER' && (!tx.description || tx.description === 'ROSTER transaction'));

            // Robust date extraction
            const rawTimestamp = tx.processDate || tx.proposedDate || tx.bidDate || tx.date || Date.now();
            const txDate = new Date(rawTimestamp);
            const safePublishedAt = isNaN(txDate.getTime()) ? new Date().toISOString() : txDate.toISOString();

            // Enriched description logic
            let description = tx.description;

            // Nullify generic or bad description so we force regeneration from items
            if (tx.items && tx.items.length > 0) {
                if (isGenericRoster || (description && description.includes('Unknown Team'))) {
                    description = "";
                }
            }

            if (!description && tx.items && tx.items.length > 0) {
                const teamMoves = new Map<string, string[]>();

                for (const item of tx.items) {
                    const mappedTeamId = item.toTeamId !== -1 ? item.toTeamId : item.fromTeamId;

                    // Safe Team Name Resolution
                    let teamName = "Unknown Team";
                    if (mappedTeamId !== -1 && teamMap.has(String(mappedTeamId))) {
                        teamName = teamMap.get(String(mappedTeamId))!;
                    } else if (mappedTeamId === -1) {
                        // Should not happen for to/from logic usually, but handled
                        teamName = "League";
                    }

                    // Try to resolve player name
                    const playerName = item.playerPoolEntry?.player?.fullName ||
                        playerMap.get(item.playerId) ||
                        `Player ${item.playerId}`;

                    let moveDetail = "";
                    const fromTeamIdStr = String(item.fromTeamId);
                    const toTeamIdStr = String(item.toTeamId);

                    if (item.type === 'ADD') {
                        const from = item.fromTeamId === -1 ? "Free Agency" : (teamMap.get(fromTeamIdStr) || "Waivers");
                        moveDetail = `added ${playerName} from ${from}`;
                    } else if (item.type === 'DROP') {
                        const to = item.toTeamId === -1 ? "Waivers" : "Roster";
                        // If toTeamId is not -1, it might be a trade drop or similar, but usually -1 is waivers
                        moveDetail = `dropped ${playerName} to ${to}`;
                    } else if (item.type === 'WAIVER') {
                        moveDetail = `added ${playerName} via Waivers`;
                    } else if (item.type === 'TRADE') {
                        const toTeam = teamMap.get(toTeamIdStr) || "Unknown";
                        moveDetail = `traded ${playerName} to ${toTeam}`;
                    } else if (tx.type === 'ROSTER') {
                        // Attempt to decipher Roster moves
                        if (item.fromLineupSlotId !== item.toLineupSlotId) {
                            // This is a lineup change, often ignored, but if we are here we deemed it relevant?
                            // Actually we skip LINEUP txs.
                            // Currently specific "ROSTER" txs might satisfy this.
                            moveDetail = `moved ${playerName}`;
                        } else {
                            moveDetail = `updated ${playerName}`;
                        }
                    }

                    if (moveDetail) {
                        if (!teamMoves.has(teamName)) {
                            teamMoves.set(teamName, []);
                        }
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

            // Skip if description is still empty/generic after all attempts
            // This filters out empty Roster updates that had no actionable items
            if (!description || description === 'ROSTER transaction') continue;

            const { error } = await supabase
                .from('league_transactions')
                .upsert({
                    league_id: leagueId,
                    espn_transaction_id: String(tx.id),
                    type: tx.type,
                    description: description,
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
