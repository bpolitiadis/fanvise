import { createClient } from '@supabase/supabase-js';
import { EspnClient } from '@/lib/espn/client';
import { fetchAndSyncTransactions } from '@/services/transaction.service';
import { loadEnv } from './load-env';

interface EspnMember {
  id: string;
  firstName?: string;
  lastName?: string;
}

interface EspnTeam {
  id: number;
  name?: string;
  location?: string;
  nickname?: string;
  abbrev?: string;
  owners?: string[];
  record?: {
    overall?: {
      wins?: number;
      losses?: number;
      ties?: number;
    };
  };
}

const run = async (): Promise<void> => {
  loadEnv();
  console.log('[Ops] Syncing league data from ESPN to Supabase...');

  const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
  const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || '2026';
  const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';
  const swid = process.env.ESPN_SWID;
  const s2 = process.env.ESPN_S2;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!leagueId || !supabaseUrl || !supabaseKey) {
    console.error(
      '[Ops] Missing one or more required env vars: NEXT_PUBLIC_ESPN_LEAGUE_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
    process.exit(1);
  }

  try {
    const client = new EspnClient(leagueId, seasonId, sport, swid, s2);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const data = await client.getLeagueSettings();
    if (!data?.settings) {
      throw new Error('Failed to fetch league settings from ESPN');
    }

    const scoringSettings = data.settings.scoringSettings.scoringItems.reduce(
      (acc: Record<string, number>, item: { statId: number; points: number }) => {
        acc[String(item.statId)] = item.points;
        return acc;
      },
      {}
    );

    const teams = ((data.teams || []) as EspnTeam[]).map((team) => {
      const member = ((data.members || []) as EspnMember[]).find((m) => m.id === team.owners?.[0]);
      const isUserOwned = swid ? team.owners?.includes(swid) : false;

      return {
        id: team.id,
        name:
          team.name ||
          (team.location && team.nickname ? `${team.location} ${team.nickname}` : team.abbrev) ||
          `Team ${team.id}`,
        abbrev: team.abbrev,
        manager: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
        wins: team.record?.overall?.wins || 0,
        losses: team.record?.overall?.losses || 0,
        ties: team.record?.overall?.ties || 0,
        is_user_owned: isUserOwned,
      };
    });

    const { error } = await supabase.from('leagues').upsert({
      league_id: leagueId,
      season_id: seasonId,
      name: data.settings.name,
      scoring_settings: scoringSettings,
      roster_settings: data.settings.rosterSettings.lineupSlotCounts,
      teams,
      last_updated_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    await fetchAndSyncTransactions(leagueId, seasonId, sport, supabase);
    console.log('[Ops] League and transaction sync completed successfully.');
  } catch (error) {
    console.error('[Ops] League sync failed:', error);
    process.exit(1);
  }
};

void run();
