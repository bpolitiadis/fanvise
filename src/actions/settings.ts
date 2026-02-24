"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { settingsSchema } from "@/lib/settings-schema";

export type { SettingsSchema } from "@/lib/settings-schema";

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

export async function updateUserSettings(
  data: z.infer<typeof settingsSchema>
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "You must be signed in to save settings." };
  }

  const { gemini_api_key, espn_league_id, espn_team_id } = parsed.data;

  const { error: upsertError } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        // Make sure not to overwrite fields if they are missing from payload (undefined vs null).
        ...(gemini_api_key !== undefined && { gemini_api_key_encrypted: gemini_api_key || null }),
        ...(espn_league_id !== undefined && { espn_league_id: espn_league_id || null }),
        ...(espn_team_id !== undefined && { espn_team_id: espn_team_id || null }),
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    console.error("[updateUserSettings] DB error:", upsertError.message);
    return { success: false, error: "Failed to save settings. Please try again." };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function getTeamsForLeague(leagueId: string, seasonId?: string) {
  if (!leagueId || leagueId.trim() === "") return [];
  try {
    const { EspnClient } = await import("@/lib/espn/client");
    const year = seasonId || new Date().getFullYear().toString();
    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || 'fba';

    // We only need the basic league info and teams, no deep roster logic
    const client = new EspnClient(leagueId.trim(), year, sport, process.env.ESPN_SWID, process.env.ESPN_S2);
    const leagueData = await client.getLeagueSettings();

    if (!leagueData || !leagueData.teams) {
      return [];
    }

    return leagueData.teams.map((t: any) => ({
      id: t.id.toString(),
      name: (t.location && t.nickname) ? `${t.location} ${t.nickname}` : (t.name || `Team ${t.id}`),
      abbrev: t.abbrev || "",
    }));
  } catch (error) {
    console.error("[getTeamsForLeague] Failed to fetch teams:", error);
    return [];
  }
}
