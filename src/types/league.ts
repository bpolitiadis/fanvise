/**
 * League Intelligence and Database Types
 */

import { Player, Team, Matchup, WeeklySchedule, ScoringSettings, RosterSlots } from './fantasy';
type JsonObject = Record<string, unknown>;

/**
 * Complete intelligence snapshot for a user's current context.
 * Aggregates data from multiple sources for the AI.
 */
export interface IntelligenceSnapshot {
    /** League information */
    league: {
        id: string;
        name: string;
        seasonId: string;
        scoringSettings: ScoringSettings;
        rosterSlots: RosterSlots;
        draftDetail?: JsonObject;
        positionalRatings?: JsonObject;
        liveScoring?: JsonObject;
    };
    /** The team currently being viewed (perspective) */
    myTeam: Team;
    /** Current opponent if in an active matchup */
    opponent?: Team;
    /** Current matchup scores and status */
    matchup?: Matchup;
    /** Schedule density for streaming decisions */
    schedule?: WeeklySchedule;
    /** Top available free agents */
    freeAgents?: Player[];
    /** Timestamp of when snapshot was built */
    builtAt: string;
}

/**
 * Raw team data from the database.
 */
export interface DbTeam {
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
export interface DbLeague {
    league_id: string;
    season_id: string;
    name: string;
    scoring_settings: ScoringSettings;
    roster_settings: RosterSlots;
    draft_detail?: JsonObject;
    positional_ratings?: JsonObject;
    live_scoring?: JsonObject;
    teams?: DbTeam[];
}
