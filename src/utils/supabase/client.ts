import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/env";

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
}

export function createTypedClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabasePublishableKey());
}
