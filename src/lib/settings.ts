import { createClient } from "@/utils/supabase/server";

export interface UserConfig {
  geminiApiKey: string | null;
  espnLeagueId: string | null;
  espnTeamId: string | null;
}

/**
 * Fetches per-user config from the `user_settings` table.
 * Falls back to environment variables so local development never breaks when
 * the DB row is wiped or the user hasn't saved settings yet.
 *
 * Priority: DB row  →  environment variables  →  null
 */
export async function getUserConfig(): Promise<UserConfig> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let dbSettings: {
    gemini_api_key_encrypted: string | null;
    espn_league_id: string | null;
    espn_team_id: string | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("user_settings")
      .select("gemini_api_key_encrypted, espn_league_id, espn_team_id")
      .eq("user_id", user.id)
      .single();

    dbSettings = data ?? null;
  }

  return {
    geminiApiKey:
      dbSettings?.gemini_api_key_encrypted ??
      process.env.GEMINI_API_KEY ??
      null,
    espnLeagueId:
      dbSettings?.espn_league_id ??
      process.env.NEXT_PUBLIC_TEST_ESPN_LEAGUE_ID ??
      null,
    espnTeamId: dbSettings?.espn_team_id ?? null,
  };
}
