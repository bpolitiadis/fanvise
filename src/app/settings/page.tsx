import { redirect } from "next/navigation";
import { KeyRound, SlidersHorizontal } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SettingsForm } from "@/components/settings/settings-form";
import { NewsSourcesSection } from "@/components/settings/news-sources-section";
import { MainLayout } from "@/components/layout/main-layout";
import { createClient } from "@/utils/supabase/server";
import { getNewsSourcesWithUserPreferences } from "@/services/news-preferences.service";

export const metadata = {
  title: "Settings | FanVise",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("gemini_api_key_encrypted, espn_league_id, espn_team_id")
    .eq("user_id", user.id)
    .single();

  const defaultValues = {
    // Never send the raw key back as a visible default — just signal presence.
    gemini_api_key: "",
    espn_league_id: settings?.espn_league_id ?? "",
    espn_team_id: settings?.espn_team_id ?? "",
    hasApiKey: Boolean(settings?.gemini_api_key_encrypted),
  };

  const newsSources = await getNewsSourcesWithUserPreferences(user.id);

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage your API keys, fantasy league connection, and news sources.
            </p>
          </div>
        </div>

        <Separator className="mb-8" />

        {/* Security notice */}
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your Gemini API key is stored per-account and used only to power
            your personal AI requests. It is never shared or logged.
          </p>
        </div>

        <SettingsForm defaultValues={defaultValues} />

        <Separator className="my-8" />

        <NewsSourcesSection
          sources={newsSources.map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            default_trust_level: s.default_trust_level,
            is_enabled: s.is_enabled,
            display_order: s.display_order,
          }))}
        />
      </div>
    </MainLayout>
  );
}
