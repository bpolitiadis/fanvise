"use client";

import { createClient } from "@/utils/supabase/client";

/**
 * Signs out the current user and redirects to login. Uses a full page navigation
 * to ensure session cookies are cleared and middleware sees the updated state.
 */
export async function signOutAndRedirect(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  window.location.href = "/login";
}
