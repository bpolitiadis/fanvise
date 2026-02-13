import { describe, it, expect } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const hasSupabaseEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const describeIfIntegrationAndEnv =
  shouldRunIntegration && hasSupabaseEnv ? describe : describe.skip;

describeIfIntegrationAndEnv('Schedule integration', () => {
  it('can read games in a date range', async () => {
    const { ScheduleService } = await import('@/services/schedule.service');
    const scheduleService = new ScheduleService();
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 7);

    const games = await scheduleService.getGamesInRange(start, end);
    expect(Array.isArray(games)).toBe(true);
  });

  it('syncs schedule when explicitly enabled', async () => {
    if (process.env.RUN_MUTATING_INTEGRATION_TESTS !== 'true') {
      return;
    }

    const { ScheduleService } = await import('@/services/schedule.service');
    const scheduleService = new ScheduleService();
    const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID || '2026';

    const upserted = await scheduleService.syncSchedule(seasonId);
    expect(upserted).toBeGreaterThan(0);
  });
});
