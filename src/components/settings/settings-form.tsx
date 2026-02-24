"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { useState, useTransition, useEffect } from "react";

import { settingsSchema } from "@/lib/settings-schema";
import type { SettingsSchema } from "@/lib/settings-schema";
import { updateUserSettings, getTeamsForLeague } from "@/actions/settings";
import { usePerspective } from "@/lib/perspective-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface SettingsFormProps {
  defaultValues: SettingsSchema & { hasApiKey?: boolean };
}

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const [showKey, setShowKey] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [teams, setTeams] = useState<{ id: string; name: string; abbrev: string }[]>([]);
  const [isFetchingTeams, setIsFetchingTeams] = useState(false);
  const { refreshPerspective } = usePerspective();

  const form = useForm<SettingsSchema>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      gemini_api_key: defaultValues.gemini_api_key ?? "",
      espn_league_id: defaultValues.espn_league_id ?? "",
      espn_team_id: defaultValues.espn_team_id ?? "",
    },
  });

  const watchedLeagueId = form.watch("espn_league_id");

  useEffect(() => {
    let active = true;
    const fetchTeams = async () => {
      if (!watchedLeagueId || watchedLeagueId.trim() === "") {
        setTeams([]);
        return;
      }
      setIsFetchingTeams(true);
      try {
        const fetched = await getTeamsForLeague(watchedLeagueId);
        if (active) {
          setTeams(fetched);
          // If the current team ID is set but not in the fetched list, we might want to let the user know, 
          // or just leave it. Keeping the value even if not in options is standard for Select sometimes, 
          // but we rely on the options to display.
        }
      } catch (err) {
        if (active) setTeams([]);
      } finally {
        if (active) setIsFetchingTeams(false);
      }
    };
    
    // Debounce the fetch by 500ms
    const timeout = setTimeout(fetchTeams, 500);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [watchedLeagueId]);

  function onSubmit(values: SettingsSchema) {
    startTransition(async () => {
      const result = await updateUserSettings(values);
      if (result.success) {
        await refreshPerspective();
        toast.success("Settings saved.", {
          description: "Your configuration has been updated.",
        });
      } else {
        toast.error("Failed to save settings.", {
          description: result.error,
        });
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* ── AI Configuration ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              AI Configuration
            </h2>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Bring your own Gemini API key. When provided, it replaces the
              platform default.
            </p>
          </div>

          <FormField
            control={form.control}
            name="gemini_api_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gemini API Key</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      type={showKey ? "text" : "password"}
                      placeholder={
                        defaultValues.hasApiKey
                          ? "••••••••••••••••  (saved)"
                          : "AIza..."
                      }
                      autoComplete="off"
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label={showKey ? "Hide API key" : "Show API key"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormDescription>
                  Get a key at{" "}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    aistudio.google.com/apikey
                  </a>
                  . Leave blank to use the platform default.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <Separator />

        {/* ── ESPN Fantasy League ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              ESPN Fantasy League
            </h2>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Your ESPN session credentials (SWID &amp; S2 cookies) are
              managed server-side. Set your League ID and Team ID here to
              personalise your perspective.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="espn_league_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>League ID</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={
                        process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID
                          ? `Default: ${process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID}`
                          : "e.g. 12345678"
                      }
                      inputMode="numeric"
                      className="font-mono text-sm"
                    />
                  </FormControl>
                  <FormDescription>
                    Found in your ESPN league URL:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      ?leagueId=…
                    </code>
                    {process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID && (
                      <span className="ml-1 text-muted-foreground/60">
                        Leave blank to use the server default.
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="espn_team_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    My Team ID
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      (your default perspective)
                    </span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isFetchingTeams || teams.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger className="font-mono text-sm max-w-full">
                        <SelectValue
                          placeholder={
                            isFetchingTeams
                              ? "Loading teams..."
                              : teams.length === 0
                              ? "Enter League ID first"
                              : "Select Team"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} (ID: {t.id})
                        </SelectItem>
                      ))}
                      {/* Fallback to show existing value if not fetched yet, to avoid UI crash if a team is set but not in dropdown */}
                      {field.value && !teams.find((t) => t.id === field.value) && (
                        <SelectItem value={field.value} className="hidden">
                          Team {field.value}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Your team number in the league. Sets your default
                    perspective — you can still view any team via the
                    sidebar switcher.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending} className="min-w-[120px]">
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isPending ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
