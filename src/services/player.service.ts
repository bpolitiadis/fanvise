import { EspnClient } from '@/lib/espn/client';
import { Player as PlayerContext } from '@/types/fantasy';
import { getPositionName, ESPN_PRO_TEAM_MAP } from '@/lib/espn/constants';
import { EspnKonaPlayerEntry } from '@/lib/espn/types';

export class PlayerService {
    private client: EspnClient;
    private seasonId: string;

    constructor(leagueId: string, seasonId: string, sport: string = 'fba', swid?: string, s2?: string) {
        this.client = new EspnClient(leagueId, seasonId, sport, swid, s2);
        this.seasonId = seasonId;
    }

    /**
     * Fetches top available free agents.
     * 
     * @param limit Number of players to fetch
     * @param positionId Optional position ID to filter by
     * @returns Array of formatted PlayerContext objects
     */
    async getTopFreeAgents(limit: number = 20, positionId?: number): Promise<PlayerContext[]> {
        try {
            const rawPlayers = await this.client.getFreeAgents(limit, positionId);
            return (rawPlayers as EspnKonaPlayerEntry[]).map(entry => this.mapEspnPlayerToContext(entry));
        } catch (error) {
            console.error('[PlayerService] Error fetching free agents:', error);
            return [];
        }
    }

    /**
     * Maps raw ESPN player data to the AI-ready PlayerContext format.
     */
    private mapEspnPlayerToContext(entry: EspnKonaPlayerEntry): PlayerContext {
        const player = entry.player;

        const seasonStats = player.stats?.find(s =>
            s.seasonId === parseInt(this.seasonId) &&
            s.statSourceId === 0 &&
            s.statSplitTypeId === 0
        );

        const projectStats = player.stats?.find(s =>
            s.seasonId === parseInt(this.seasonId) &&
            s.statSourceId === 1 &&
            s.statSplitTypeId === 0
        );

        // Fallback to projection if actuals are 0/missing (common early season)
        const statsToUse = seasonStats || projectStats;

        return {
            id: String(player.id),
            firstName: player.firstName || '',
            lastName: player.lastName || '',
            fullName: player.fullName || 'Unknown Player',
            proTeam: ESPN_PRO_TEAM_MAP[player.proTeamId ?? 0] ?? String(player.proTeamId || 0),
            proTeamId: player.proTeamId ?? 0,
            position: getPositionName(player.defaultPositionId || 0),
            injuryStatus: player.injuryStatus || 'ACTIVE',
            isInjured: player.injured || false,
            jersey: player.jersey,
            avgPoints: statsToUse?.appliedAverage || 0,
            totalPoints: statsToUse?.appliedTotal || 0,
            // Additional context for free agents
            seasonOutlook: player.seasonOutlook,
            lastNewsDate: player.lastNewsDate,
            ownership: player.ownership ? {
                percentOwned: player.ownership.percentOwned,
                percentChange: player.ownership.percentChange,
                percentStarted: player.ownership.percentStarted
            } : undefined
        };
    }
}
