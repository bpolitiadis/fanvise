import { createAdminClient } from '@/utils/supabase/server';
import { EspnClient } from '@/lib/espn/client';
import { SupabaseClient } from '@supabase/supabase-js';

export interface NbaGame {
    id: string;
    date: string; // ISO string
    homeTeamId: number;
    awayTeamId: number;
    seasonId: string;
    scoringPeriodId?: number;
}

export class ScheduleService {
    private supabaseClient?: SupabaseClient;

    constructor(supabaseClient?: SupabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    /**
     * Syncs the NBA schedule from ESPN API to the database.
     * 
     * @param seasonId - The season ID (e.g., "2024")
     */
    async syncSchedule(seasonId: string): Promise<number> {
        const client = new EspnClient("0", seasonId, "fba"); // League ID 0 for global data
        const data = await client.getProTeamSchedules();
        const proTeams = data.settings?.proTeams;

        if (!proTeams || !Array.isArray(proTeams)) {
            throw new Error("No pro teams found in ESPN response");
        }

        const gamesMap = new Map<string, NbaGame>();

        // ESPN returns a schedule PER TEAM. This means every game is duplicated (once for home, once for away).
        // We use a Map to deduplicate based on Game ID.
        for (const team of proTeams) {
            if (!team.proGamesByScoringPeriod) continue;

            for (const periodId in team.proGamesByScoringPeriod) {
                const games = team.proGamesByScoringPeriod[periodId];
                for (const game of games) {
                    // Only process valid games with teams
                    if (!game.homeProTeamId || !game.awayProTeamId) continue;

                    const gameId = String(game.id);
                    if (!gamesMap.has(gameId)) {
                        gamesMap.set(gameId, {
                            id: gameId,
                            date: new Date(game.date).toISOString(),
                            homeTeamId: game.homeProTeamId,
                            awayTeamId: game.awayProTeamId,
                            seasonId: seasonId,
                            scoringPeriodId: typeof game.scoringPeriodId === 'number' ? game.scoringPeriodId : parseInt(game.scoringPeriodId as string) || undefined
                        });
                    }
                }
            }
        }

        const games = Array.from(gamesMap.values());

        if (games.length === 0) {
            console.warn("[ScheduleService] No games found to sync.");
            return 0;
        }

        // Server-side sync jobs must use service-role credentials for writes.
        const supabase = this.supabaseClient || createAdminClient();

        // Upsert in batches to avoid payload limits
        const BATCH_SIZE = 500;
        let upsertedCount = 0;

        for (let i = 0; i < games.length; i += BATCH_SIZE) {
            const batch = games.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('nba_schedule')
                .upsert(batch.map(g => ({
                    id: g.id,
                    date: g.date,
                    home_team_id: g.homeTeamId,
                    away_team_id: g.awayTeamId,
                    season_id: g.seasonId,
                    scoring_period_id: g.scoringPeriodId
                })));

            if (error) {
                console.error(`[ScheduleService] Error syncing batch ${i}:`, error);
                throw error;
            }
            upsertedCount += batch.length;
        }

        console.log(`[ScheduleService] Upserted ${upsertedCount} NBA games.`);
        return upsertedCount;
    }

    /**
     * Gets games scheduled for a specific date range.
     */
    async getGamesInRange(startDate: Date, endDate: Date): Promise<NbaGame[]> {
        // Use Admin Client to ensure service-level access without needing request context (cookies)
        const supabase = this.supabaseClient || createAdminClient();

        const { data, error } = await supabase
            .from('nba_schedule')
            .select('*')
            .gte('date', startDate.toISOString())
            .lte('date', endDate.toISOString())
            .order('date', { ascending: true });

        if (error) throw error;

        return (data || []).map(row => ({
            id: row.id,
            date: row.date,
            homeTeamId: row.home_team_id,
            awayTeamId: row.away_team_id,
            seasonId: row.season_id,
            scoringPeriodId: row.scoring_period_id
        }));
    }

    /**
     * Gets all valid NBA Pro Team IDs that have games today.
     */
    async getTeamsPlayingOnDate(date: Date): Promise<number[]> {
        // Start of day
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        // End of day
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        const games = await this.getGamesInRange(start, end);
        const teamIds = new Set<number>();

        for (const game of games) {
            teamIds.add(game.homeTeamId);
            teamIds.add(game.awayTeamId);
        }

        return Array.from(teamIds);
    }
}
