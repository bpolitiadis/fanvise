"use client";

import { useState } from "react";
import { Newspaper, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateNewsSourcePreference } from "@/actions/news-preferences";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export interface NewsSourceWithPref {
  id: string;
  slug: string;
  name: string;
  default_trust_level: number;
  is_enabled: boolean;
  display_order: number;
}

interface NewsSourcesSectionProps {
  sources: NewsSourceWithPref[];
}

const trustStars = (level: number) =>
  "★".repeat(Math.min(5, Math.max(0, level))) + "☆".repeat(5 - Math.min(5, level));

export function NewsSourcesSection({ sources }: NewsSourcesSectionProps) {
  const [local, setLocal] = useState<Record<string, boolean>>(
    Object.fromEntries(sources.map((s) => [s.id, s.is_enabled]))
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  async function handleToggle(sourceId: string, checked: boolean) {
    setLocal((prev) => ({ ...prev, [sourceId]: checked }));
    setPending((prev) => new Set(prev).add(sourceId));
    const result = await updateNewsSourcePreference(sourceId, checked);
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(sourceId);
      return next;
    });
    if (result.success) {
      toast.success("News source updated.");
    } else {
      toast.error(result.error);
      setLocal((prev) => ({ ...prev, [sourceId]: !checked }));
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            News Sources
          </h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Choose which sources the AI uses for fantasy advice. Disabled sources
            are excluded from recommendations.
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
        {sources.map((src) => (
          <div
            key={src.id}
            className="flex items-center justify-between gap-3 rounded-lg py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium">{src.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {trustStars(src.default_trust_level)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {pending.has(src.id) && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Switch
                checked={local[src.id] ?? src.is_enabled}
                onCheckedChange={(checked) => handleToggle(src.id, checked)}
                disabled={pending.has(src.id)}
                aria-label={`Toggle ${src.name} as news source`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
