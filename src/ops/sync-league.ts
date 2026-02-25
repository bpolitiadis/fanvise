import { createClient } from '@supabase/supabase-js';
import { EspnClient } from '@/lib/espn/client';
import { mapEspnLeagueData } from '@/lib/espn/mappers';
import { fetchAndSyncTransactions } from '@/services/transaction.service';
import { loadEnv } from './load-env';

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

    const parsed = mapEspnLeagueData(data, swid);

    const scoringSettings = data.settings.scoringSettings?.scoringItems
      ? data.settings.scoringSettings.scoringItems.reduce(
          (acc: Record<string, number>, item: { statId: number; points: number }) => {
            acc[String(item.statId)] = item.points;
            return acc;
          },
          {}
        )
      : parsed.scoringSettings;

    const rosterSettings = data.settings.rosterSettings?.lineupSlotCounts
      ?? parsed.rosterSettings;

    const now = new Date().toISOString();
    const { error } = await supabase.from('leagues').upsert({
      league_id: leagueId,
      season_id: seasonId,
      name: parsed.name,
      scoring_settings: scoringSettings,
      roster_settings: rosterSettings,
      teams: parsed.teams,
      draft_detail: parsed.draftDetail,
      positional_ratings: parsed.positionalRatings,
      live_scoring: parsed.liveScoring,
      roster_snapshot: parsed.teams,
      roster_snapshot_at: now,
      last_updated_at: now,
    });

    if (error) {
      throw error;
    }

    console.log(`[Ops] League "${parsed.name}" upserted with ${parsed.teams.length} teams.`);
    await fetchAndSyncTransactions(leagueId, seasonId, sport, supabase);
    console.log('[Ops] League and transaction sync completed successfully.');
  } catch (error) {
    console.error('[Ops] League sync failed:', error);
    process.exit(1);
  }
};

void run();
