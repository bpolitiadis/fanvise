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
    draftDetail: Record<string, unknown>;
    positionalRatings: Record<string, unknown>;
    liveScoring: Record<string, unknown>;
}

/**
 * Maps the raw ESPN league settings response to a clean internal structure.
 * 
 * @param data - Raw JSON response from ESPN
 * @param swid - Optional SWID for determining user ownership
 * @returns ParsedLeagueData
 */
export function mapEspnLeagueData(data: EspnLeagueResponse, swid?: string): ParsedLeagueData {
    const toJsonObject = (value: unknown): Record<string, unknown> => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }
        return {};
    };
    const settings = data.settings || {};
    const name = settings.name || `League ${data.id}`;
    const scoringSettings = (settings.scoringSettings || data.settings?.scoringSettings || {}) as Record<string, unknown>;
    const rosterSettings = (settings.rosterSettings || data.settings?.rosterSettings || {}) as Record<string, unknown>;
    const draftDetailCandidate = toJsonObject(data.draftDetail);
    const fallbackDraftFromSettings = toJsonObject((settings as Record<string, unknown>).draftSettings);

    const playerNameById = new Map<number, string>();
    for (const team of data.teams || []) {
        const rosterEntries = team.roster?.entries || team.rosterForCurrentScoringPeriod?.entries || [];
        for (const entry of rosterEntries) {
            const player = entry.playerPoolEntry?.player;
            if (!player) continue;
            if (typeof player.id !== "number") continue;
            const fullName = player.fullName || `${player.firstName || ""} ${player.lastName || ""}`.trim();
            if (!fullName) continue;
            if (!playerNameById.has(player.id)) {
                playerNameById.set(player.id, fullName);
            }
        }
    }

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
            manager: member
                ? `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.displayName || "Unknown"
                : "Unknown",
            is_user_owned: isUserOwned
        };
    });

    const resolvedDraftDetail = Object.keys(draftDetailCandidate).length > 0
        ? draftDetailCandidate
        : fallbackDraftFromSettings;

    const draftPicks = (resolvedDraftDetail as { picks?: unknown }).picks;
    if (Array.isArray(draftPicks)) {
        (resolvedDraftDetail as { picks: unknown[] }).picks = draftPicks.map((pick) => {
            if (!pick || typeof pick !== "object") return pick;
            const typedPick = pick as { playerId?: unknown; playerName?: unknown };
            const playerId = typeof typedPick.playerId === "number" ? typedPick.playerId : null;
            const mappedPlayerName = playerId !== null ? playerNameById.get(playerId) : undefined;
            if (!mappedPlayerName) return pick;
            return {
                ...typedPick,
                playerName: typeof typedPick.playerName === "string" && typedPick.playerName.trim().length > 0
                    ? typedPick.playerName
                    : mappedPlayerName,
            };
        });
    }

    return {
        name,
        scoringSettings,
        rosterSettings,
        teams,
        draftDetail: resolvedDraftDetail,
        positionalRatings: toJsonObject(data.positionalRatings),
        liveScoring: toJsonObject(data.liveScoring)
    };
}
