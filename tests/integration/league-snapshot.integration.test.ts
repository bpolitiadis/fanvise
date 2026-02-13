import { describe, it, expect } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
const teamId = process.env.FANVISE_TEST_TEAM_ID || process.env.NEXT_PUBLIC_ESPN_TEAM_ID;

const describeIfIntegrationAndEnv =
  shouldRunIntegration && !!leagueId && !!teamId ? describe : describe.skip;

describeIfIntegrationAndEnv('League snapshot integration', () => {
  it('builds a snapshot with expected base structure', async () => {
    const { buildIntelligenceSnapshot } = await import('@/services/league.service');
    const snapshot = await buildIntelligenceSnapshot(leagueId!, teamId!);

    expect(snapshot.league.id).toBe(leagueId);
    expect(snapshot.myTeam.id).toBe(String(teamId));
    expect(snapshot.builtAt).toBeTruthy();
    expect(Array.isArray(snapshot.freeAgents)).toBe(true);
  });
});
