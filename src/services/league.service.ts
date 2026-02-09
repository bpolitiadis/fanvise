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
    MatchupContext,
    ScheduleContext,
    ScoringSettings,
    RosterSlots,
} from '@/prompts/types';

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
    teams: DbTeam[]
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
            last_updated_at: new Date().toISOString()
        });

    if (error) {
        console.error(`[League Service] Error upserting league ${leagueId}:`, error.message);
        throw error;
    }

    console.log(`[League Service] Successfully upserted league ${leagueId} (${name})`);
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
function toTeamContext(dbTeam: DbTeam): TeamContext {
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
    teamId: string
): Promise<{ matchup: MatchupContext; opponentId: string } | null> {
    try {
        const year = new Date().getFullYear().toString();
        const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';

        const espnClient = new EspnClient(leagueId, year, sport);
        const matchupData = await espnClient.getMatchups();

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

        return {
            matchup: {
                myScore,
                opponentScore,
                differential: myScore - opponentScore,
                status: currentMatchup.winner === 'UNDECIDED' ? 'in_progress' : 'completed',
                scoringPeriod: matchupData.scoringPeriodId,
            },
            opponentId: String(opponentData?.teamId),
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

    const myTeam = toTeamContext(myTeamDb);

    // 3. Fetch matchup from ESPN (includes opponent ID)
    const matchupResult = await fetchMatchupFromEspn(leagueId, teamId);

    let opponent: TeamContext | undefined;
    let matchup: MatchupContext | undefined;

    if (matchupResult) {
        matchup = matchupResult.matchup;

        const opponentDb = findTeamInLeague(league, matchupResult.opponentId);
        if (opponentDb) {
            opponent = toTeamContext(opponentDb);
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
        if (weight !== undefined) {
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
