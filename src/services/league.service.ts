/**
 * FanVise League Service
 * 
 * Builds comprehensive "Intelligence Snapshots" for AI context injection.
 * This service aggregates data from Supabase and ESPN to provide
 * the complete picture needed for strategic advice.
 * 
 * @module services/league
 */

import { createClient } from '@/utils/supabase/server';
import { EspnClient } from '@/lib/espn/client';
import type {
    TeamContext,
    PlayerContext,
    MatchupContext,
    ScheduleContext,
    ScoringSettings,
    RosterSlots,
} from '@/prompts/types';
import { getPositionName } from '@/lib/espn/constants';

// ============================================================================
// Types
// ============================================================================

/**
 * Complete intelligence snapshot for a user's current context.
 * This is the primary output of this service, designed to be
 * directly transformed into a PromptContext.
 */
export interface IntelligenceSnapshot {
    /** League information */
    league: {
        id: string;
        name: string;
        seasonId: string;
        scoringSettings: ScoringSettings;
        rosterSlots: RosterSlots;
        draftDetail?: any;
        positionalRatings?: any;
        liveScoring?: any;
    };
    /** The team currently being viewed (perspective) */
    myTeam: TeamContext;
    /** Current opponent if in an active matchup */
    opponent?: TeamContext;
    /** Current matchup scores and status */
    matchup?: MatchupContext;
    /** Schedule density for streaming decisions */
    schedule?: ScheduleContext;
    /** Timestamp of when snapshot was built */
    builtAt: string;
}

/**
 * Raw team data from the database.
 */
interface DbTeam {
    id: string | number;
    name: string;
    abbrev: string;
    manager?: string;
    manager_name?: string;
    is_user_owned?: boolean;
    wins?: number;
    losses?: number;
    ties?: number;
}

/**
 * Raw league data from the database.
 */
interface DbLeague {
    league_id: string;
    season_id: string;
    name: string;
    scoring_settings: ScoringSettings;
    roster_settings: RosterSlots;
    draft_detail?: any;
    positional_ratings?: any;
    live_scoring?: any;
    teams?: DbTeam[];
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
async function fetchLeague(leagueId: string): Promise<DbLeague | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('league_id', leagueId)
        .single();

    if (error) {
        console.warn(`[League Service] Error fetching league ${leagueId}:`, error.message);
        return null;
    }

    return data as DbLeague;
}

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
export async function upsertLeague(
    leagueId: string,
    seasonId: string,
    name: string,
    scoringSettings: ScoringSettings,
    rosterSettings: RosterSlots,
    teams: DbTeam[],
    draftDetail?: any,
    positionalRatings?: any,
    liveScoring?: any
): Promise<void> {
    const supabase = await createClient();

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
async function fetchMatchupFromEspn(
    leagueId: string,
    teamId: string,
    seasonId: string
): Promise<{
    matchup: MatchupContext;
    opponentId: string;
    myRoster?: PlayerContext[];
    opponentRoster?: PlayerContext[];
} | null> {
    try {
        const year = seasonId;
        const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';

        const swid = process.env.ESPN_SWID;
        const s2 = process.env.ESPN_S2;
        const espnClient = new EspnClient(leagueId, year, sport, swid, s2);
        // Request roster views specifically to get player data
        const matchupData = await espnClient.getMatchups(undefined, ['mMatchupScore', 'mScoreboard', 'mRoster', 'rosterForCurrentScoringPeriod']);

        if (!matchupData?.schedule) {
            console.warn('[League Service] No schedule found in ESPN matchup data');
            return null;
        }

        const teamIdNum = parseInt(teamId);
        const currentMatchup = matchupData.schedule.find((m: any) =>
            m.away?.teamId === teamIdNum || m.home?.teamId === teamIdNum
        );

        if (!currentMatchup) {
            console.warn(`[League Service] No matchup found for team ${teamId}`);
            return null;
        }

        const isHome = currentMatchup.home?.teamId === teamIdNum;
        const myTeamData = isHome ? currentMatchup.home : currentMatchup.away;
        const opponentData = isHome ? currentMatchup.away : currentMatchup.home;

        const myScore = myTeamData?.totalPoints || 0;
        const opponentScore = opponentData?.totalPoints || 0;

        // Map roster data
        const mapRoster = (rosterData: any, targetSeasonId: string): PlayerContext[] => {
            if (!rosterData?.entries || !Array.isArray(rosterData.entries)) return [];
            return rosterData.entries.map((entry: any) => {
                const player = entry.playerPoolEntry?.player;
                const stats = player?.stats || [];

                // Find stats specifically for the target season
                const seasonStats = stats.find((s: any) =>
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
                };
            });
        };

        const opponentId = String(opponentData?.teamId);

        console.log(`[League Service] Found matchup for team ${teamIdNum}. My Score: ${myScore}, Opponent: ${opponentId}, Opponent Score: ${opponentScore}`);
        console.log(`[League Service] Total teams in response: ${matchupData.teams?.length || 0}`);

        // Find roster entries in the top-level teams array (more reliable)
        const findRoster = (tid: number) => {
            const team = matchupData.teams?.find((t: any) => t.id === tid);
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
            myRoster,
            opponentRoster,
        };
    } catch (error) {
        console.error('[League Service] Failed to fetch matchup from ESPN:', error);
        return null;
    }
}

// ============================================================================
// Schedule Density Calculation
// ============================================================================

/**
 * Calculates schedule density for the current week.
 * 
 * This is a simplified implementation. In production, this would
 * integrate with NBA schedule data to count actual games.
 * 
 * @param leagueId - The league ID
 * @param myTeamId - My team ID
 * @param opponentTeamId - Opponent team ID
 * @returns Schedule context or undefined
 */
async function calculateScheduleDensity(
    _leagueId: string,
    _myTeamId: string,
    _opponentTeamId?: string
): Promise<ScheduleContext | undefined> {
    // TODO: Integrate with NBA schedule API or roster data
    // For now, return undefined as this requires external schedule data
    // that we don't have readily available

    // Placeholder implementation - would need to:
    // 1. Fetch each team's roster
    // 2. For each player, check NBA schedule for remaining games this week
    // 3. Sum up total games remaining

    console.log('[League Service] Schedule density calculation not yet implemented');
    return undefined;
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Builds a comprehensive Intelligence Snapshot for AI context injection.
 * 
 * This is the main entry point for gathering all context needed by the
 * Strategic Consigliere prompt. It aggregates data from:
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
        throw new Error(`Team ${teamId} not found in league ${leagueId}`);
    }

    // 3. Fetch matchup from ESPN (includes opponent ID)
    const matchupResult = await fetchMatchupFromEspn(leagueId, teamId, league.season_id);

    const myTeam = toTeamContext(myTeamDb, matchupResult?.myRoster);

    // 4. Extract matchup and opponent from ESPN result
    let opponent: TeamContext | undefined;
    let matchup: MatchupContext | undefined;

    if (matchupResult) {
        matchup = matchupResult.matchup;

        const opponentDb = findTeamInLeague(league, matchupResult.opponentId);
        if (opponentDb) {
            opponent = toTeamContext(opponentDb, matchupResult.opponentRoster);
        }
    }

    // 4. Calculate schedule density (if opponent exists)
    const schedule = await calculateScheduleDensity(
        leagueId,
        teamId,
        opponent?.id
    );

    // 5. Build and return snapshot
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
