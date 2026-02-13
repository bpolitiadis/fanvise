/**
 * strict-espn.types.ts
 * 
 * Strict TypeScript definitions for the ESPN Fantasy API based on observed usage.
 * These types replace the loose `any` typing previously used.
 */

export interface EspnLeagueSettings {
    name?: string;
    scoringSettings?: Record<string, unknown>;
    rosterSettings?: Record<string, unknown>;
}

export interface EspnRecord {
    overall?: {
        wins?: number;
        losses?: number;
        ties?: number;
        pointsFor?: number;
        pointsAgainst?: number;
    };
}

export interface EspnTeam {
    id: number;
    abbrev?: string;
    location?: string;
    nickname?: string;
    name?: string; // Sometimes present directly, otherwise constructed
    logo?: string;
    owners?: string[];
    record?: EspnRecord;
    roster?: EspnRoster;
    // Roster might be under different keys depending on the view
    rosterForCurrentScoringPeriod?: EspnRoster;
    rosterForCurrentScoringPeriodString?: string;
}

export interface EspnMember {
    id: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    isLeagueManager?: boolean;
}

export interface EspnPlayerOwnership {
    percentOwned?: number;
    percentChange?: number;
    percentStarted?: number;
}

export interface EspnPlayer {
    id: number;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    defaultPositionId?: number;
    proTeamId?: number;
    injured?: boolean;
    injuryStatus?: string;
    jersey?: string;
    stats?: EspnPlayerStats[];
    ownership?: EspnPlayerOwnership;
    seasonOutlook?: string;
    lastNewsDate?: number;
}

export interface EspnKonaPlayerEntry {
    id: number;
    player: EspnPlayer;
    ownership?: EspnPlayerOwnership;
    status?: string;
    ratings?: Record<string, unknown>;
}

export interface EspnPlayerStats {
    id?: string;
    seasonId?: number;
    scoringPeriodId?: number;
    statSourceId?: number; // 0 = Actual, 1 = Projected
    statSplitTypeId?: number;
    appliedTotal?: number;
    appliedAverage?: number;
    stats?: Record<string, number>;
}

export interface EspnPlayerPoolEntry {
    id: number;
    player: EspnPlayer;
    appliedStatTotal?: number;
}

export interface EspnRosterEntry {
    playerId: number;
    playerPoolEntry?: EspnPlayerPoolEntry;
    lineupSlotId?: number;
    injuryStatus?: string;
    status?: string;
}

export interface EspnRoster {
    entries?: EspnRosterEntry[];
    appliedStatTotal?: number;
}

export interface EspnDraftDetail {
    drafted?: boolean;
    inProgress?: boolean;
}

export interface EspnPositionalRating {
    // Structure unknown, using broad type for now but avoiding 'any' where possible
    [key: string]: unknown;
}

export interface EspnLiveScoring {
    // Structure unknown
    [key: string]: unknown;
}

export interface EspnProGame {
    id: number;
    description?: string;
    startTime?: string;
    state?: string;
    homeProTeamId: number;
    awayProTeamId: number;
    date: number; // Timestamp
    scoringPeriodId: number | string;
}

export interface EspnProTeam {
    id: number;
    abbrev: string;
    location: string;
    name: string;
    byeWeek: number;
    proGamesByScoringPeriod?: Record<string, EspnProGame[]>;
}

export interface EspnLeagueResponse {
    id: number;
    seasonId: number;
    scoringPeriodId: number;
    firstScoringPeriod: number;
    finalScoringPeriod: number;
    segmentId: number;
    status: {
        isActive?: boolean;
        currentMatchupPeriod?: number;
    };
    settings?: EspnLeagueSettings & {
        proTeams?: EspnProTeam[];
    };
    teams?: EspnTeam[];
    members?: EspnMember[];
    draftDetail?: EspnDraftDetail;
    positionalRatings?: EspnPositionalRating;
    liveScoring?: EspnLiveScoring;
    schedule?: EspnMatchup[]; // If matchups view is requested
}

export interface EspnMatchupTeam {
    teamId: number;
    totalPoints?: number;
    rosterForCurrentScoringPeriod?: EspnRoster;
}

export interface EspnMatchup {
    id: number;
    matchupPeriodId: number;
    winner?: 'HOME' | 'AWAY' | 'UNDECIDED' | 'TIE';
    home?: EspnMatchupTeam;
    away?: EspnMatchupTeam;
}
