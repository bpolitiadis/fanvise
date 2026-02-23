/**
 * FanVise League Service
 * 
 * Builds comprehensive "Intelligence Snapshots" for AI context injection.
 * 
 * BUSINESS CONTEXT:
 * This service is the "Eyes" of the Strategist. It aggregates fragmented data 
 * from ESPN into a structured league perspective required for the 
 * FanVise Strategist prompt. This "Snapshot" is 
 * essential for preventing AI hallucinations by grounding every piece of advice 
 * in the specific rules, roster constraints, and matchup realities of the user.
 * 
 * @module services/league
 */

import { createAdminClient } from '@/utils/supabase/server';
import { EspnClient } from '@/lib/espn/client';
import { PlayerService } from '@/services/player.service';
import { withRetry } from '@/utils/retry';
import { unstable_cache } from 'next/cache';
import type {
    Team as TeamContext,
    Player as PlayerContext,
    Matchup as MatchupContext,
    WeeklySchedule as ScheduleContext,
    ScoringSettings,
    RosterSlots,
} from '@/types/fantasy';
import type {
    IntelligenceSnapshot,
    DbLeague,
    DbTeam
} from '@/types/league';
import { getPositionName } from '@/lib/espn/constants';

// Core types now imported from @/types/league and @/types/fantasy
type JsonObject = Record<string, unknown>;

interface EspnMatchupTeam {
    teamId?: number;
    totalPoints?: number;
}

interface EspnScheduleMatchup {
    away?: EspnMatchupTeam;
    home?: EspnMatchupTeam;
    matchupPeriodId?: number;
    winner?: string;
}

interface EspnSeasonStats {
    statSourceId?: number;
    statSplitTypeId?: number;
    seasonId?: number | string;
    appliedAverage?: number;
    appliedTotal?: number;
    stats?: Record<string, number>;
}

interface EspnPlayerDetails {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    proTeamId?: number | string;
    defaultPositionId?: number | string;
    injuryStatus?: string;
    injured?: boolean;
    jersey?: string;
    stats?: EspnSeasonStats[];
    seasonOutlook?: string;
    lastNewsDate?: string;
}

interface EspnRosterEntry {
    playerId?: number | string;
    playerPoolEntry?: {
        player?: EspnPlayerDetails;
    };
}

interface EspnTeam {
    id?: number;
    location?: string;
    nickname?: string;
    name?: string;
    abbrev?: string;
    roster?: { entries?: EspnRosterEntry[] };
    rosterForCurrentScoringPeriod?: { entries?: EspnRosterEntry[] };
    rosterForCurrentScoringPeriodString?: { entries?: EspnRosterEntry[] };
}

// ============================================================================
// Database Functions
// ============================================================================

/**
 * Fetches a league by ID from Supabase.
 * 
 * @param leagueId - The ESPN league ID
 * @returns The league data or null if not found
 */
async function fetchLeagueUncached(leagueId: string): Promise<DbLeague | null> {
    // Use Admin Client to bypass RLS policies and ensure the service can read league data
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('league_id', leagueId)
        .single();

    if (error) {
        console.warn(`[League Service] Error fetching league ${leagueId}:`, error.message);
        return null;
    }

    if (!data) {
        console.warn(`[League Service] League ${leagueId} NOT FOUND in Supabase.`);
    } else {
        console.log(`[League Service] League ${leagueId} found in Supabase. Season: ${data.season_id}`);
    }

    return data as DbLeague;
}

const fetchLeague = unstable_cache(
    async (leagueId: string): Promise<DbLeague | null> => fetchLeagueUncached(leagueId),
    ['league-service-fetch-league'],
    { revalidate: 60 }
);

/**
 * Upserts (inserts or updates) a league in the database.
 * 
 * @param leagueId - The ESPN league ID
 * @param seasonId - The season ID
 * @param name - League name
 * @param scoringSettings - Scoring configuration
 * @param rosterSettings - Roster slot configuration
 * @param teams - Array of team data
 */
/**
 * Thin public wrapper around fetchLeague for use in agent tools.
 * Returns the cached DB league (with teams/standings) without calling ESPN.
 */
export async function fetchLeagueForTool(leagueId: string) {
    return fetchLeague(leagueId);
}

export async function upsertLeague(
    leagueId: string,
    seasonId: string,
    name: string,
    scoringSettings: ScoringSettings,
    rosterSettings: RosterSlots,
    teams: DbTeam[],
    draftDetail?: JsonObject,
    positionalRatings?: JsonObject,
    liveScoring?: JsonObject
): Promise<void> {
    // Use Admin Client for write operations to ensure system-level access
    const supabase = createAdminClient();

    const { error } = await supabase
        .from('leagues')
        .upsert({
            league_id: leagueId,
            season_id: seasonId,
            name: name,
            scoring_settings: scoringSettings,
            roster_settings: rosterSettings,
            teams: teams,
            draft_detail: draftDetail || {},
            positional_ratings: positionalRatings || {},
            live_scoring: liveScoring || {},
            last_updated_at: new Date().toISOString()
        });

    if (error) {
        console.error(`[League Service] Error upserting league ${leagueId}:`, error.message);
        throw error;
    }

    console.log(`[League Service] Successfully upserted league ${leagueId} (${name}) with intelligence data`);
}


/**
 * Finds a team within a league's team array.
 * 
 * @param league - The league data
 * @param teamId - The team ID to find
 * @returns The team data or null if not found
 */
function findTeamInLeague(league: DbLeague, teamId: string): DbTeam | null {
    if (!league.teams || !Array.isArray(league.teams)) {
        return null;
    }

    return league.teams.find(t => String(t.id) === String(teamId)) || null;
}

/**
 * Converts a database team to a TeamContext.
 * 
 * @param dbTeam - The raw database team
 * @returns Formatted TeamContext
 */
function toTeamContext(dbTeam: DbTeam, roster?: PlayerContext[]): TeamContext {
    return {
        id: String(dbTeam.id),
        name: dbTeam.name,
        abbrev: dbTeam.abbrev,
        manager: dbTeam.manager || dbTeam.manager_name || 'Unknown',
        isUserOwned: dbTeam.is_user_owned,
        record: (dbTeam.wins !== undefined && dbTeam.losses !== undefined)
            ? {
                wins: dbTeam.wins,
                losses: dbTeam.losses,
                ties: dbTeam.ties || 0,
            }
            : undefined,
        roster,
    };
}

// ============================================================================
// ESPN Integration
// ============================================================================

/**
 * Fetches current matchup data from ESPN.
 * 
 * @param leagueId - The ESPN league ID
 * @param teamId - The team ID to find matchup for
 * @returns Matchup context or undefined if not found
 */
async function fetchMatchupFromEspnUncached(
    leagueId: string,
    teamId: string,
    seasonId: string
): Promise<{
    matchup: MatchupContext;
    opponentId: string;
    myTeamDetails: { name: string; abbrev: string };
    opponentDetails: { name: string; abbrev: string };
    myRoster?: PlayerContext[];
    opponentRoster?: PlayerContext[];
} | null> {
    try {
        const year = seasonId;
        const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';

        const swid = process.env.ESPN_SWID;
        const s2 = process.env.ESPN_S2;
        const espnClient = new EspnClient(leagueId, year, sport, swid, s2);
        // Request roster views specifically to get player data.
        // Wrapped in withRetry to handle transient ESPN 429 rate-limits or network failures
        // that would otherwise silently drop all roster/matchup context from the AI prompt.
        const matchupData = await withRetry(
            () => espnClient.getMatchups(undefined, ['mMatchupScore', 'mScoreboard', 'mRoster', 'rosterForCurrentScoringPeriod']),
            3,
            1000
        );

        if (!matchupData?.schedule) {
            console.warn('[League Service] No schedule found in ESPN matchup data');
            return null;
        }

        const currentPeriod = matchupData.status?.currentMatchupPeriod || matchupData.scoringPeriodId || 1;
        console.log(`[League Service] Current Matchup Period detected: ${currentPeriod}`);

        const teamIdNum = parseInt(teamId);
        // Filter by BOTH team presence AND current matchup period
        let currentMatchup = matchupData.schedule.find((m: EspnScheduleMatchup) =>
            (m.away?.teamId === teamIdNum || m.home?.teamId === teamIdNum) &&
            m.matchupPeriodId === currentPeriod
        );

        if (!currentMatchup) {
            console.warn(`[League Service] No matchup found for team ${teamId} in period ${currentPeriod}. Falling back to first available matchup.`);
            // Fallback to any matchup if current period not found (might happen if season ended or hasn't started)
            const fallbackMatchup = matchupData.schedule.find((m: EspnScheduleMatchup) =>
                m.away?.teamId === teamIdNum || m.home?.teamId === teamIdNum
            );
            if (!fallbackMatchup) return null;
            currentMatchup = fallbackMatchup;
        }

        const isHome = currentMatchup.home?.teamId === teamIdNum;
        const myTeamData = isHome ? currentMatchup.home : currentMatchup.away;
        const opponentData = isHome ? currentMatchup.away : currentMatchup.home;

        const myScore = myTeamData?.totalPoints || 0;
        const opponentScore = opponentData?.totalPoints || 0;

        // Map roster data
        const mapRoster = (
            rosterData: { entries?: EspnRosterEntry[] } | null,
            targetSeasonId: string
        ): PlayerContext[] => {
            if (!rosterData?.entries || !Array.isArray(rosterData.entries)) return [];
            return rosterData.entries.map((entry: EspnRosterEntry) => {
                const player = entry.playerPoolEntry?.player;
                const stats = player?.stats || [];

                // Find stats specifically for the target season
                const seasonStats = stats.find((s: EspnSeasonStats) =>
                    s.statSourceId === 0 &&
                    s.statSplitTypeId === 0 &&
                    String(s.seasonId) === targetSeasonId
                );

                return {
                    id: String(entry.playerId),
                    firstName: player?.firstName || '',
                    lastName: player?.lastName || '',
                    fullName: player?.fullName || 'Unknown Player',
                    proTeam: String(player?.proTeamId || ''),
                    position: getPositionName(player?.defaultPositionId || ''),
                    injuryStatus: player?.injuryStatus || 'ACTIVE',
                    isInjured: player?.injured || false,
                    jersey: player?.jersey,
                    // Performance Metrics
                    avgPoints: seasonStats?.appliedAverage,
                    totalPoints: seasonStats?.appliedTotal,
                    gamesPlayed: seasonStats?.stats?.['42'],
                    avgStats: seasonStats?.stats,
                    // Additional Intelligence
                    seasonOutlook: player?.seasonOutlook,
                    lastNewsDate: player?.lastNewsDate,
                };
            });
        };

        const opponentId = String(opponentData?.teamId);

        // Helper to get fresh team metadata from the top-level teams array
        const getTeamDetails = (tid: number) => {
            const team = matchupData.teams?.find((t: EspnTeam) => t.id === tid);
            if (!team) return { name: `Team ${tid}`, abbrev: '' };
            const name = (team.location && team.nickname) ? `${team.location} ${team.nickname}` : (team.name || `Team ${tid}`);
            return { name, abbrev: team.abbrev || '' };
        };

        const myTeamDetails = getTeamDetails(teamIdNum);
        const opponentDetails = getTeamDetails(parseInt(opponentId));

        console.log(`[League Service] Found matchup for team ${teamIdNum} (${myTeamDetails.name}). My Score: ${myScore}, Opponent: ${opponentId} (${opponentDetails.name}), Opponent Score: ${opponentScore}`);
        console.log(`[League Service] Total teams in response: ${matchupData.teams?.length || 0}`);

        // Find roster entries in the top-level teams array (more reliable)
        const findRoster = (tid: number) => {
            const team = matchupData.teams?.find((t: EspnTeam) => t.id === tid);
            if (!team) {
                console.warn(`[League Service] Team ${tid} not found in teams array!`);
                return null;
            }
            // Exhaustive check of roster fields
            const roster = team.roster || team.rosterForCurrentScoringPeriod || team.rosterForCurrentScoringPeriodString;
            console.log(`[League Service] Team ${tid} roster found: ${!!roster}, entries: ${roster?.entries?.length || 0}`);
            return roster;
        };

        const myRoster = mapRoster(findRoster(teamIdNum), year);
        const opponentRoster = mapRoster(findRoster(parseInt(opponentId)), year);

        console.log(`[League Service] Mapped rosters - My: ${myRoster.length}, Opponent: ${opponentRoster.length}`);

        return {
            matchup: {
                myScore,
                opponentScore,
                differential: myScore - opponentScore,
                status: currentMatchup.winner === 'UNDECIDED' ? 'in_progress' : 'completed',
                scoringPeriod: matchupData.scoringPeriodId,
            },
            opponentId,
            myTeamDetails,
            opponentDetails,
            myRoster,
            opponentRoster,
        };
    } catch (error) {
        console.error('[League Service] Failed to fetch matchup from ESPN:', error);
        return null;
    }
}

/**
 * Cached ESPN matchup fetch. Cache key MUST include leagueId, teamId, seasonId
 * to avoid serving one user's roster to another (wrong league/team).
 */
function fetchMatchupFromEspn(
    leagueId: string,
    teamId: string,
    seasonId: string
): ReturnType<typeof fetchMatchupFromEspnUncached> {
    return unstable_cache(
        () => fetchMatchupFromEspnUncached(leagueId, teamId, seasonId),
        ['league-service-fetch-matchup', leagueId, teamId, seasonId],
        { revalidate: 45 }
    )();
}

// ============================================================================
// Schedule Density Calculation
// ============================================================================

import { ScheduleService } from './schedule.service';

const getGamesInRangeCached = unstable_cache(
    async (startIso: string, endIso: string) => {
        const scheduleService = new ScheduleService();
        return scheduleService.getGamesInRange(new Date(startIso), new Date(endIso));
    },
    ['league-service-get-games-in-range'],
    { revalidate: 21600 } // 6h
);

/**
 * Calculates schedule density for the current week.
 * 
 * Uses the ScheduleService to look up real NBA games for the involved teams
 * over the next 7 days (proxy for "current matchup/week" until we have exact dates).
 * 
 * @param leagueId - The league ID
 * @param myTeam - My team context with roster
 * @param opponentTeam - Opponent team context with roster
 * @returns Schedule context
 */
async function calculateScheduleDensity(
    _leagueId: string,
    myTeam: TeamContext,
    opponentTeam?: TeamContext
): Promise<ScheduleContext | undefined> {
    if (!myTeam.roster) return undefined;

    // Define the time window: Today -> Today + 6 days
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0); // Normalize to start of day to catch early games (e.g. UTC midnight)

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999); // Normalize to end of day

    try {
        const games = await getGamesInRangeCached(startDate.toISOString(), endDate.toISOString());

        // Helper to count games for a roster
        const countGames = (roster: PlayerContext[]) => {
            let manGames = 0;
            for (const player of roster) {
                const proTeamId = parseInt(player.proTeam);
                // Count how many times this pro team appears in the games list
                const gamesForPlayer = games.filter(g => g.homeTeamId === proTeamId || g.awayTeamId === proTeamId).length;
                manGames += gamesForPlayer;
            }
            return manGames;
        };

        const myGamesRemaining = countGames(myTeam.roster);
        const opponentGamesRemaining = opponentTeam?.roster ? countGames(opponentTeam.roster) : 0;

        // "Played" is hard to calc without looking backwards. For now we return 0 for played 
        // to clearly indicate this is a "forward looking" metric, or we could look back 7 days too.
        // Let's stick to "Remaining" as the critical decision factor.

        return {
            myGamesPlayed: 0,
            myGamesRemaining,
            opponentGamesPlayed: 0,
            opponentGamesRemaining
        };

    } catch (error) {
        console.error('[League Service] Failed to calculate schedule density:', error);
        return undefined;
    }
}

const fetchFreeAgentsCached = unstable_cache(
    async (
        leagueId: string,
        seasonId: string,
        myRosterKey: string,
        opponentRosterKey: string
    ): Promise<PlayerContext[]> => {
        const swid = process.env.ESPN_SWID;
        const s2 = process.env.ESPN_S2;
        const playerService = new PlayerService(
            leagueId,
            seasonId,
            process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba',
            swid,
            s2
        );

        const rawFreeAgents = await playerService.getTopFreeAgents(150);
        const myPlayerIds = new Set(myRosterKey ? myRosterKey.split(',') : []);
        const opponentPlayerIds = new Set(opponentRosterKey ? opponentRosterKey.split(',') : []);

        return rawFreeAgents.filter((p) => {
            if (myPlayerIds.has(p.id)) return false;
            if (opponentPlayerIds.has(p.id)) return false;
            if (p.isInjured) return false;
            return true;
        }).slice(0, 15);
    },
    ['league-service-fetch-free-agents'],
    { revalidate: 300 }
);

// ============================================================================
// Transaction Processing
// ============================================================================

/**
 * Processes raw ESPN transaction data into human-readable strings.
 * 
 * @param transactions - Raw transaction objects from ESPN
 * @param teams - Database team objects for name resolution
 * @returns Array of formatted transaction strings (limited to last 10)
 */
function processTransactions(transactions: any[], teams: DbTeam[]): string[] {
    if (!Array.isArray(transactions)) return [];

    // Create a map of team ID to team name/abbrev
    const teamMap = new Map<number, string>();
    teams.forEach(t => {
        teamMap.set(Number(t.id), t.abbrev || t.name);
    });

    // Filter for relevant types (WAIVER, FREEAGENT, TRADE) and EXECUTED status
    const relevantTypes = ['WAIVER', 'FREEAGENT', 'TRADE'];

    // Sort by date descending (newest first)
    const sorted = [...transactions]
        .filter(t => relevantTypes.includes(t.type) && t.status === 'EXECUTED')
        .sort((a, b) => b.processDate - a.processDate);

    return sorted.slice(0, 10).map(t => {
        const teamName = teamMap.get(t.teamId) || `Team ${t.teamId || 'Unknown'}`;
        const date = new Date(t.processDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Process items (players added/dropped)
        const items = t.items || [];
        const additions: string[] = [];
        const drops: string[] = [];

        items.forEach((item: any) => {
            const playerName = item.playerPoolEntry?.player?.fullName || 'Unknown Player';
            if (item.type === 'ADD') additions.push(playerName);
            if (item.type === 'DROP') drops.push(playerName);
        });

        let actionDescription = '';
        if (t.type === 'TRADE') {
            actionDescription = `Trade executed containing ${additions.length + drops.length} players.`;
            // Trades are complex in ESPN API, simplified representation for now
            return `[${date}] TRADE: ${teamName} involved in a trade.`;
        } else {
            const parts = [];
            if (additions.length > 0) parts.push(`Added ${additions.join(', ')}`);
            if (drops.length > 0) parts.push(`Dropped ${drops.join(', ')}`);
            actionDescription = parts.join(', ');
        }

        return `[${date}] ${teamName}: ${actionDescription}`;
    });
}


// ============================================================================
// Main API
// ============================================================================

/**
 * Builds a comprehensive Intelligence Snapshot for AI context injection.
 * 
 * This is the main entry point for gathering all context needed by the
 * FanVise Strategist prompt. It aggregates data from:
 * - Supabase (league settings, teams)
 * - ESPN API (current matchup scores)
 * 
 * @param leagueId - The ESPN league ID
 * @param teamId - The team ID to view as (perspective)
 * @returns Complete intelligence snapshot
 * @throws Error if league or team not found
 * 
 * @example
 * ```typescript
 * import { buildIntelligenceSnapshot } from '@/services/league.service';
 * 
 * const snapshot = await buildIntelligenceSnapshot('12345', '1');
 * console.log(snapshot.myTeam.name); // "Alpha Wolves"
 * console.log(snapshot.matchup?.differential); // 30.5
 * ```
 */
export async function buildIntelligenceSnapshot(
    leagueId: string,
    teamId: string
): Promise<IntelligenceSnapshot> {
    // 1. Fetch league data
    const league = await fetchLeague(leagueId);

    if (!league) {
        throw new Error(`League ${leagueId} not found in database`);
    }

    // 2. Find the active team
    const myTeamDb = findTeamInLeague(league, teamId);

    if (!myTeamDb) {
        console.error(`[League Service] Team ${teamId} not found in league teams list. Available teams: ${league.teams?.map(t => t.id).join(', ')}`);
        throw new Error(`Team ${teamId} not found in league ${leagueId}`);
    }

    // 3. Fetch matchup from ESPN (includes opponent ID)
    console.log(`[League Service] Fetching matchup from ESPN for League ${leagueId}, Team ${teamId}, Season ${league.season_id}`);
    const matchupResult = await fetchMatchupFromEspn(leagueId, teamId, league.season_id);

    if (!matchupResult) {
        console.warn(`[League Service] ESPN Matchup fetch returned null. Falling back to basic team data.`);
    }

    const myTeam = toTeamContext(myTeamDb, matchupResult?.myRoster);

    // Overwrite with fresh metadata if available from ESPN (prevents stale DB names)
    if (matchupResult?.myTeamDetails) {
        myTeam.name = matchupResult.myTeamDetails.name;
        myTeam.abbrev = matchupResult.myTeamDetails.abbrev;
    }

    // 4. Extract matchup and opponent from ESPN result
    let opponent: TeamContext | undefined;
    let matchup: MatchupContext | undefined;

    if (matchupResult) {
        matchup = matchupResult.matchup;

        const opponentDb = findTeamInLeague(league, matchupResult.opponentId);
        if (opponentDb) {
            opponent = toTeamContext(opponentDb, matchupResult.opponentRoster);
        } else {
            // Fallback if opponent not in DB (e.g. sync issue)
            opponent = {
                id: matchupResult.opponentId,
                name: matchupResult.opponentDetails.name,
                abbrev: matchupResult.opponentDetails.abbrev,
                manager: 'Unknown',
                roster: matchupResult.opponentRoster
            };
        }

        // Apply fresh names to opponent as well
        if (opponent && matchupResult.opponentDetails) {
            opponent.name = matchupResult.opponentDetails.name;
            opponent.abbrev = matchupResult.opponentDetails.abbrev;
        }
    }

    // 4. Calculate schedule density (if opponent exists)
    // 4. Calculate schedule density (if opponent exists)
    const schedule = await calculateScheduleDensity(
        leagueId,
        myTeam,
        opponent
    );

    // 5. Fetch Free Agents
    let freeAgents: PlayerContext[] = [];
    try {
        const myRosterKey = (myTeam.roster ?? []).map((p) => p.id).sort().join(',');
        const opponentRosterKey = (opponent?.roster ?? []).map((p) => p.id).sort().join(',');
        freeAgents = await fetchFreeAgentsCached(
            leagueId,
            league.season_id,
            myRosterKey,
            opponentRosterKey
        );
        console.log(`[League Service] Filtered free agents: ${freeAgents.length} valid options found.`);
    } catch (faError) {
        console.error('[League Service] Failed to fetch free agents:', faError);
    }

    // 6. Fetch Recent Transactions
    let transactions: string[] = [];
    try {
        const espnClient = new EspnClient(leagueId, league.season_id, process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba', process.env.ESPN_SWID, process.env.ESPN_S2);
        const txnData = await withRetry(() => espnClient.getTransactions(), 3, 1000);

        if (txnData && txnData.transactions) {
            transactions = processTransactions(txnData.transactions, league.teams || []);
            console.log(`[League Service] Processed ${transactions.length} recent transactions.`);
        }
    } catch (txnError) {
        console.error('[League Service] Failed to fetch transactions:', txnError);
    }

    // 7. Build and return snapshot
    return {
        league: {
            id: league.league_id,
            name: league.name,
            seasonId: league.season_id,
            scoringSettings: league.scoring_settings || {},
            rosterSlots: league.roster_settings || {},
            draftDetail: league.draft_detail,
            positionalRatings: league.positional_ratings,
            liveScoring: league.live_scoring,
        },
        myTeam,
        opponent,
        matchup,
        schedule,
        freeAgents,
        transactions,
        builtAt: new Date().toISOString(),
    };
}

/**
 * Calculates the expected fantasy points for a stat line.
 * 
 * This is used to verify AI recommendations and ensure
 * scoring calculations are accurate.
 * 
 * @param stats - Object with stat category keys and numeric values
 * @param scoringSettings - The league's scoring configuration
 * @returns Total fantasy points
 * 
 * @example
 * ```typescript
 * const points = calculateFantasyPoints(
 *   { PTS: 25, AST: 8, REB: 10, BLK: 2, STL: 1, TO: 3 },
 *   { PTS: 1, AST: 1.5, REB: 1.2, BLK: 3, STL: 3, TO: -1 }
 * );
 * // Returns: 25 + 12 + 12 + 6 + 3 - 3 = 55
 * ```
 */
export function calculateFantasyPoints(
    stats: Record<string, number>,
    scoringSettings: ScoringSettings
): number {
    let total = 0;

    for (const [category, value] of Object.entries(stats)) {
        const weight = scoringSettings[category];
        if (typeof weight === 'number') {
            total += value * weight;
        }
    }

    return Math.round(total * 100) / 100; // Round to 2 decimal places
}


/**
 * Formats an intelligence snapshot for direct prompt injection.
 * 
 * @param snapshot - The intelligence snapshot
 * @returns Formatted string for prompt context
 */
export function formatSnapshotForPrompt(snapshot: IntelligenceSnapshot): string {
    const lines: string[] = [
        `League: ${snapshot.league.name}`,
        `Viewing As: ${snapshot.myTeam.name} (${snapshot.myTeam.manager})`,
        `Scoring: ${JSON.stringify(snapshot.league.scoringSettings)}`,
    ];

    if (snapshot.opponent) {
        lines.push(`Opponent: ${snapshot.opponent.name} (${snapshot.opponent.manager})`);
    }

    if (snapshot.matchup) {
        lines.push(
            `Score: ${snapshot.matchup.myScore} - ${snapshot.matchup.opponentScore} ` +
            `(${snapshot.matchup.differential > 0 ? '+' : ''}${snapshot.matchup.differential})`
        );
    }

    return lines.join('\n');
}
