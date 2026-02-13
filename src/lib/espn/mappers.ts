/**
 * ESPN Data Mappers
 * 
 * Utilities for transforming raw ESPN API responses into FanVise domain objects.
 * 
 * @module lib/espn/mappers
 */

import { EspnLeagueResponse, EspnMember, EspnTeam } from "./types";

export interface ParsedLeagueTeam {
    id: string;
    name: string;
    abbrev: string;
    logo?: string;
    wins: number;
    losses: number;
    ties: number;
    manager: string;
    is_user_owned: boolean;
}

export interface ParsedLeagueData {
    name: string;
    scoringSettings: Record<string, unknown>;
    rosterSettings: Record<string, unknown>;
    teams: ParsedLeagueTeam[];
    draftDetail: unknown;
    positionalRatings: unknown;
    liveScoring: unknown;
}

/**
 * Maps the raw ESPN league settings response to a clean internal structure.
 * 
 * @param data - Raw JSON response from ESPN
 * @param swid - Optional SWID for determining user ownership
 * @returns ParsedLeagueData
 */
export function mapEspnLeagueData(data: EspnLeagueResponse, swid?: string): ParsedLeagueData {
    const settings = data.settings || {};
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const name = settings.name || `League ${data.id}`;
    const scoringSettings = settings.scoringSettings || {};
    const rosterSettings = settings.rosterSettings || {};

    // Extract teams
    // data.teams usually contains the team info
    // data.members usually contains the manager info
    const teams = (data.teams || []).map((t: EspnTeam) => {
        const member = (data.members || []).find((m: EspnMember) =>
            // Owners is an array of strings (SWIDs)
            t.owners && t.owners.length > 0 && m.id === t.owners[0]
        );

        const isUserOwned = swid && t.owners ? t.owners.includes(swid) : false;

        return {
            id: String(t.id),
            name: (t.location && t.nickname) ? `${t.location} ${t.nickname}` : (t.name || `Team ${t.id}`),
            abbrev: t.abbrev || '',
            logo: t.logo,
            wins: t.record?.overall?.wins || 0,
            losses: t.record?.overall?.losses || 0,
            ties: t.record?.overall?.ties || 0,
            manager: member ? `${member.firstName} ${member.lastName}` : "Unknown",
            is_user_owned: isUserOwned
        };
    });

    return {
        name,
        scoringSettings,
        rosterSettings,
        teams,
        draftDetail: data.draftDetail || {},
        positionalRatings: data.positionalRatings || {},
        liveScoring: data.liveScoring || {}
    };
}
