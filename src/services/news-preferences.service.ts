/**
 * News source preferences — which sources each user trusts.
 * Used for query-time filtering in searchNews().
 */

import { createClient } from "@/utils/supabase/server";

export interface NewsSource {
  id: string;
  slug: string;
  name: string;
  source_type: string;
  url: string | null;
  default_trust_level: number;
  is_default: boolean;
  display_order: number;
}

export interface UserNewsPreference {
  source_id: string;
  source: NewsSource;
  is_enabled: boolean;
  custom_trust_level: number | null;
}

/**
 * Returns the list of source *names* (e.g. 'ESPN', 'Rotowire') that are enabled for the user.
 * - If user has no preferences: all default sources.
 * - If user has preferences: only sources with is_enabled=true, or fall back to default if no pref.
 */
export async function getEnabledSourceNamesForUser(userId: string | null): Promise<string[] | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("user_news_preferences")
    .select("source_id, is_enabled")
    .eq("user_id", userId);

  const { data: allSources } = await supabase
    .from("news_sources")
    .select("id, name, is_default")
    .order("display_order", { ascending: true });

  if (!allSources?.length) return null;

  const prefBySourceId = new Map<string, boolean>();
  for (const p of prefs || []) {
    const pref = p as { source_id: string; is_enabled: boolean };
    prefBySourceId.set(pref.source_id, pref.is_enabled);
  }

  const enabled: string[] = [];
  for (const src of allSources as { id: string; name: string; is_default: boolean }[]) {
    const hasPref = prefBySourceId.has(src.id);
    const enabledByPref = prefBySourceId.get(src.id);
    if (hasPref) {
      if (enabledByPref) enabled.push(src.name);
    } else if (src.is_default) {
      enabled.push(src.name);
    }
  }
  return enabled;
}

/**
 * Returns all news sources with the user's preference (if any).
 */
export async function getNewsSourcesWithUserPreferences(userId: string | null) {
  const supabase = await createClient();
  const { data: sources, error } = await supabase
    .from("news_sources")
    .select("*")
    .order("display_order", { ascending: true });

  if (error || !sources?.length) return [];

  if (!userId) {
    return sources.map((s) => ({
      ...s,
      is_enabled: s.is_default,
      custom_trust_level: null as number | null,
    }));
  }

  const { data: prefs } = await supabase
    .from("user_news_preferences")
    .select("source_id, is_enabled, custom_trust_level")
    .eq("user_id", userId);

  const prefMap = new Map<string, { is_enabled: boolean; custom_trust_level: number | null }>();
  for (const p of prefs || []) {
    const pref = p as { source_id: string; is_enabled: boolean; custom_trust_level: number | null };
    prefMap.set(pref.source_id, { is_enabled: pref.is_enabled, custom_trust_level: pref.custom_trust_level });
  }

  return sources.map((s) => {
    const pref = prefMap.get(s.id);
    return {
      ...s,
      is_enabled: pref ? pref.is_enabled : s.is_default,
      custom_trust_level: pref?.custom_trust_level ?? null,
    };
  });
}

/**
 * Upsert user's preference for a source.
 */
export async function upsertNewsPreference(
  userId: string,
  sourceId: string,
  updates: { is_enabled?: boolean; custom_trust_level?: number | null }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("user_news_preferences").upsert(
    {
      user_id: userId,
      source_id: sourceId,
      is_enabled: updates.is_enabled,
      custom_trust_level: updates.custom_trust_level,
    },
    { onConflict: "user_id,source_id" }
  );
  return { success: !error, error: error?.message };
}
