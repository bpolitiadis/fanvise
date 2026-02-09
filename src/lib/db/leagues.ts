import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export interface Team {
    id: string | number;
    name: string;
    abbrev: string;
    logo?: string;
    manager: string;
    is_user_owned?: boolean;
    wins?: number;
    losses?: number;
    ties?: number;
}

export async function fetchLeagueById(leagueId: string) {
    const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('league_id', leagueId)
        .single();

    if (error) {
        console.warn(`Error fetching league ${leagueId}:`, error.message);
        return null;
    }
    return data;
}

export async function getUserLeague(userId: string) {
    const { data, error } = await supabase
        .from('user_leagues')
        .select(`
            *,
            leagues (
                name,
                scoring_settings,
                roster_settings,
                season_id,
                teams
            )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

    if (error) {
        console.warn('Error fetching user league:', error.message);
        return null;
    }

    return data;
}

export async function fetchTeamById(leagueId: string, teamId: string) {
    const league = await fetchLeagueById(leagueId);
    if (!league || !league.teams) return null;

    const teams = league.teams as Team[];
    return teams.find(t => String(t.id) === String(teamId)) || null;
}

export async function upsertLeague(leagueId: string, seasonId: string, name: string, scoringSettings: any, rosterSettings: any, teams: any[]) {
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

    if (error) throw error;
}
