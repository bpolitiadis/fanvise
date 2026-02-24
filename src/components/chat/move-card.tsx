"use client";

/**
 * MoveCard — Lineup Optimization Recommendation Card
 *
 * Renders a structured "Drop X → Add Y" waiver wire recommendation produced
 * by the LineupOptimizerGraph. Shown beneath the assistant's text response
 * whenever the optimizer path fires (intent === "lineup_optimization").
 *
 * UX principles:
 *  - Data-first: the numbers are the hero, not decoration
 *  - Confidence-coded: border + badge color matches HIGH/MEDIUM/LOW
 *  - Explicit confirmation: user must press "Open ESPN" and mark manually
 *    — FanVise never auto-executes transactions
 *  - Freshness-aware: shows how old the data is
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Clock,
  TrendingDown,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MoveRecommendation } from "@/types/optimizer";

// ─── Confidence colour maps ───────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  HIGH: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/5",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    glow: "shadow-emerald-500/10",
    label: "High Confidence",
    icon: <Zap className="h-3 w-3" />,
  },
  MEDIUM: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    glow: "shadow-amber-500/10",
    label: "Medium Confidence",
    icon: <TrendingUp className="h-3 w-3" />,
  },
  LOW: {
    border: "border-orange-500/35",
    bg: "bg-orange-500/5",
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    glow: "shadow-orange-500/10",
    label: "Low Confidence",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
} as const;

// ─── Helper: relative time ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Single card ──────────────────────────────────────────────────────────────

interface MoveCardProps {
  move: MoveRecommendation;
  fetchedAt: string;
  espnUrl: string;
  animationDelay?: number;
}

function SingleMoveCard({ move, fetchedAt, espnUrl, animationDelay = 0 }: MoveCardProps) {
  const [executed, setExecuted] = useState(false);
  const cfg = CONFIDENCE_CONFIG[move.confidence];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: executed ? 0.55 : 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: animationDelay, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 shadow-lg transition-opacity",
        cfg.border,
        cfg.bg,
        cfg.glow,
        executed && "opacity-55"
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-widest text-primary">
            Move #{move.rank}
          </span>
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              cfg.badge
            )}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <Clock className="h-3 w-3" />
          <span>{relativeTime(fetchedAt)}</span>
        </div>
      </div>

      {/* ── Drop → Add ─────────────────────────────────────────────────────── */}
      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Drop player */}
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/80">
            Drop
          </p>
          <p className="truncate text-sm font-bold text-foreground">{move.dropPlayerName}</p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <TrendingDown className="h-3 w-3 text-red-400/70" />
            <span>Score {move.dropScore}/100</span>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>

        {/* Add player */}
        <div className="space-y-1 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">
            Add
          </p>
          <p className="truncate text-sm font-bold text-foreground">{move.addPlayerName}</p>
          <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-emerald-400/70" />
            <span>Score {move.streamScore}/100</span>
          </div>
        </div>
      </div>

      {/* ── Net gain ───────────────────────────────────────────────────────── */}
      <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Net Gain This Week
            </p>
            <p className="mt-0.5 text-2xl font-black text-emerald-400">
              +{move.netGain.toFixed(1)}
              <span className="ml-1 text-sm font-semibold text-emerald-400/70">fpts</span>
            </p>
          </div>
          <div className="text-right text-[11px] text-muted-foreground/70 space-y-0.5">
            <p>
              Baseline{" "}
              <span className="font-bold text-foreground/80">
                {move.baselineWindowFpts.toFixed(1)}
              </span>
            </p>
            <p>
              Projected{" "}
              <span className="font-bold text-emerald-300">
                {move.projectedWindowFpts.toFixed(1)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Warnings ───────────────────────────────────────────────────────── */}
      {move.warnings.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {move.warnings.map((w, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400"
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {w}
            </span>
          ))}
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      {executed ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-bold text-emerald-400">Move executed ✓</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="h-8 flex-1 rounded-xl bg-primary/90 px-3 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:bg-primary"
          >
            <a href={espnUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Open ESPN
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl border-emerald-500/30 px-3 text-[11px] font-bold text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10"
            onClick={() => setExecuted(true)}
            title="Mark this move as executed"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Done
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Move cards strip (public export) ────────────────────────────────────────

interface MoveCardsProps {
  moves: MoveRecommendation[];
  fetchedAt: string;
  windowStart?: string;
  windowEnd?: string;
  leagueId?: string | null;
}

/**
 * Renders a list of MoveCard components beneath an optimizer response.
 *
 * @param moves - Ranked move recommendations from the optimizer
 * @param fetchedAt - When the data was last fetched (ISO string)
 * @param leagueId - Used to build the ESPN deep-link URL
 */
export function MoveCards({ moves, fetchedAt, windowStart, windowEnd, leagueId }: MoveCardsProps) {
  if (moves.length === 0) return null;

  const espnBase = "https://fantasy.espn.com/basketball";
  const espnUrl = leagueId
    ? `${espnBase}/freeAgency?leagueId=${leagueId}`
    : `${espnBase}`;

  const windowLabel =
    windowStart && windowEnd
      ? `${new Date(windowStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(windowEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : null;

  return (
    <div className="mt-4 space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-primary/10" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
          Recommended Moves {windowLabel ? `· ${windowLabel}` : ""}
        </span>
        <div className="h-px flex-1 bg-primary/10" />
      </div>

      {/* Cards */}
      {moves.map((move, i) => (
        <SingleMoveCard
          key={move.rank}
          move={move}
          fetchedAt={fetchedAt}
          espnUrl={espnUrl}
          animationDelay={i * 0.08}
        />
      ))}

      {/* Safety notice */}
      <p className="text-center text-[10px] text-muted-foreground/50">
        FanVise recommends. You confirm and execute.{" "}
        <span className="font-semibold">Always verify on ESPN before making moves.</span>
      </p>
    </div>
  );
}
