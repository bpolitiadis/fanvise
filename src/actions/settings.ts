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
        // Store as plain text. Column name matches the existing schema.
        gemini_api_key_encrypted: gemini_api_key ?? null,
        espn_league_id: espn_league_id ?? null,
        espn_team_id: espn_team_id ?? null,
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
