/**
 * Core Fantasy Sports Domain Models
 * 
 * Foundational types used across the entire application for player,
 * team, and matchup data.
 */

/**
 * Player metadata and performance metrics.
 */
export interface Player {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    proTeam: string;
    position: string;
    injuryStatus: string;
    isInjured: boolean;
    jersey?: string;
    avgPoints?: number;
    totalPoints?: number;
    gamesPlayed?: number;
    avgStats?: Record<string, number>;
    seasonOutlook?: string;
    lastNewsDate?: number;
    ownership?: {
        percentOwned?: number;
        percentChange?: number;
        percentStarted?: number;
    };
}

/**
 * Record for a fantasy team.
 */
export interface TeamRecord {
    wins: number;
    losses: number;
    ties: number;
}

/**
 * Fantasy team structure.
 */
export interface Team {
    /** Team ID (ESPN format) */
    id: string;
    /** Team display name */
    name: string;
    /** Team abbreviation */
    abbrev: string;
    /** Manager/owner name */
    manager: string;
    /** Current record */
    record?: TeamRecord;
    /** Direct record fields for flatter access */
    wins?: number;
    losses?: number;
    ties?: number;
    /** Whether this is the user's own team (perspective) */
    isUserOwned?: boolean;
    /** Team logo URL */
    logo?: string;
    /** Current roster */
    roster?: Player[];
}

/**
 * Matchup state between two teams.
 */
export interface Matchup {
    /** Home score */
    myScore: number;
    /** Away score */
    opponentScore: number;
    /** Point differential */
    differential: number;
    /** Matchup status */
    status: 'in_progress' | 'completed' | 'upcoming';
    /** Current scoring period/week */
    scoringPeriod?: number;
}

/**
 * Weekly schedule density.
 */
export interface WeeklySchedule {
    myGamesPlayed: number;
    myGamesRemaining: number;
    opponentGamesPlayed: number;
    opponentGamesRemaining: number;
}

/**
 * League scoring configuration.
 */
export type ScoringSettings = Record<string, unknown>;

/**
 * League roster slot configuration.
 */
export type RosterSlots = Record<string, unknown>;
