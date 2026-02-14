import { loadEnv } from "./load-env";
import { syncDailyLeadersForDate } from "@/services/daily-leaders.service";

const run = async (): Promise<void> => {
  loadEnv();
  console.log("[Ops] Syncing daily leaders...");

  const leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID;
  const seasonId = process.env.NEXT_PUBLIC_ESPN_SEASON_ID;
  const dateInput = process.env.DAILY_LEADERS_DATE;

  if (!leagueId || !seasonId) {
    console.error("[Ops] Missing NEXT_PUBLIC_ESPN_LEAGUE_ID or NEXT_PUBLIC_ESPN_SEASON_ID.");
    process.exit(1);
  }

  const date = dateInput ? new Date(dateInput) : undefined;
  if (dateInput && Number.isNaN(date?.getTime())) {
    console.error("[Ops] DAILY_LEADERS_DATE is invalid. Use YYYY-MM-DD.");
    process.exit(1);
  }

  try {
    const result = await syncDailyLeadersForDate(leagueId, seasonId, date);
    if (!result) {
      console.warn("[Ops] No scoring period resolved for requested date.");
      process.exit(0);
    }
    console.log(
      `[Ops] Synced ${result.count} daily leaders for ${result.periodDate} (scoring period ${result.scoringPeriodId}).`
    );
  } catch (error) {
    console.error("[Ops] Daily leaders sync failed:", error);
    process.exit(1);
  }
};

void run();
