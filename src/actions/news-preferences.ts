"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { upsertNewsPreference } from "@/services/news-preferences.service";

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

export async function updateNewsSourcePreference(
  sourceId: string,
  isEnabled: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be signed in to update preferences." };
  }

  const result = await upsertNewsPreference(user.id, sourceId, { is_enabled: isEnabled });
  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to save." };
  }
  revalidatePath("/settings");
  return { success: true };
}
