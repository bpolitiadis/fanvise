import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function syncLeague() {
    console.log('🔄 Syncing League Data from ESPN to Local DB...');

    const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
    const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || '2026';
    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';

    if (!leagueId) {
        console.error('❌ Missing NEXT_PUBLIC_ESPN_LEAGUE_ID in .env.local');
        return;
    }

    try {
        // Dynamically import services
        const { EspnClient } = await import('../src/lib/espn/client');
        const { createClient } = await import('@supabase/supabase-js');
        const { fetchAndSyncTransactions } = await import('../src/services/transaction.service');

        const swid = process.env.ESPN_SWID;
        const s2 = process.env.ESPN_S2;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log(`📡 Fetching ESPN League: ${leagueId} (${seasonId})`);
        const client = new EspnClient(leagueId, seasonId, sport, swid, s2);

        // Fetch basic settings and teams
        const data = await client.getLeagueSettings();
        if (!data) throw new Error('Failed to fetch league settings from ESPN');

        const name = data.settings.name;
        const scoringSettings = data.settings.scoringSettings.scoringItems.reduce((acc: any, item: any) => {
            acc[item.statId] = item.points;
            return acc;
        }, {});

        const rosterSettings = data.settings.rosterSettings.lineupSlotCounts;

        const teams = data.teams.map((t: any) => {
            const member = (data.members || []).find((m: any) => m.id === t.owners?.[0]);
            const isUserOwned = swid ? t.owners?.includes(swid) : false;

            return {
                id: t.id,
                name: t.name || (t.location && t.nickname ? `${t.location} ${t.nickname}` : t.abbrev) || `Team ${t.id}`,
                abbrev: t.abbrev,
                manager: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
                wins: t.record?.overall?.wins || 0,
                losses: t.record?.overall?.losses || 0,
                ties: t.record?.overall?.ties || 0,
                is_user_owned: isUserOwned
            };
        });

        console.log(`💾 Upserting League to Local DB...`);
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

        console.log('🔄 Syncing Transactions...');
        await fetchAndSyncTransactions(leagueId, seasonId, sport, supabase);

        console.log('✅ League & Transaction Sync Complete!');

    } catch (error) {
        console.error('❌ Sync Failed:', error);
    }
}

syncLeague();
