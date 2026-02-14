"use client";

import { useMemo, type ReactNode } from "react";
import { Activity, CalendarClock, Users } from "lucide-react";

import type { League, Team } from "@/lib/perspective-context";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getStatName } from "@/lib/espn/constants";
import { cn } from "@/lib/utils";

type DraftValue = string | number | boolean | null | undefined;

type DraftSummaryItem = {
  label: string;
  value: string;
};

type ScoringRule = {
  statId: number;
  points: number;
};

type DraftPick = {
  id?: number;
  overallPickNumber?: number;
  roundId?: number;
  roundPickNumber?: number;
  teamId?: number;
  playerId?: number;
  playerName?: string;
};

interface LeagueOverviewProps {
  league: League;
  activeTeamId: string | null;
}

const toDraftState = (value: DraftValue): string => {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
};

const toDraftDate = (value: DraftValue): string | null => {
  if (value === null || value === undefined || value === "") return null;

  const raw = Number(value);
  const timestamp =
    Number.isFinite(raw) && !Number.isNaN(raw)
      ? raw > 1_000_000_000_000
        ? raw
        : raw * 1000
      : typeof value === "string"
        ? value
        : null;

  if (timestamp === null) return null;

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toTitleCase = (key: string): string => {
  const normalized = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const normalizeDraftLabel = (key: string): string => {
  switch (key) {
    case "drafted":
      return "Draft Completed";
    case "inProgress":
      return "In Progress";
    case "type":
    case "draftType":
      return "Draft Type";
    case "auctionBudget":
      return "Auction Budget";
    case "pickTimeLimit":
    case "pickTimeSeconds":
      return "Pick Time";
    case "rounds":
    case "totalRounds":
      return "Rounds";
    default:
      return toTitleCase(key);
  }
};

const flattenDraftDetail = (
  obj: Record<string, unknown>,
  maxDepth = 2,
  prefix = ""
): Array<{ key: string; value: DraftValue }> => {
  if (maxDepth < 0) return [];

  const entries: Array<{ key: string; value: DraftValue }> = [];

  Object.entries(obj).forEach(([key, rawValue]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (
      rawValue === null ||
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      entries.push({ key: fullKey, value: rawValue });
      return;
    }

    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) return;

      const primitiveArray = rawValue.every(
        (item) =>
          item === null ||
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean"
      );

      if (primitiveArray) {
        entries.push({ key: fullKey, value: String(rawValue.join(", ")) });
      } else {
        entries.push({ key: fullKey, value: `${rawValue.length} items` });
      }
      return;
    }

    if (typeof rawValue === "object") {
      entries.push(...flattenDraftDetail(rawValue as Record<string, unknown>, maxDepth - 1, fullKey));
    }
  });

  return entries;
};

const buildDraftSummary = (draftDetail?: Record<string, unknown>): DraftSummaryItem[] => {
  if (!draftDetail || typeof draftDetail !== "object") return [];

  const detail = draftDetail as Record<string, DraftValue>;
  const dateValue =
    toDraftDate(detail.draftDate) ||
    toDraftDate(detail.date) ||
    toDraftDate(detail.draftTime) ||
    toDraftDate(detail.scheduledDate);

  const curated = [
    { label: "Type", value: toDraftState(detail.type ?? detail.draftType ?? detail.format) },
    { label: "Draft Completed", value: toDraftState(detail.drafted) },
    { label: "In Progress", value: toDraftState(detail.inProgress) },
    { label: "Status", value: toDraftState(detail.status ?? detail.state) },
    { label: "Rounds", value: toDraftState(detail.rounds ?? detail.totalRounds) },
    { label: "Pick Time", value: toDraftState(detail.pickTimeLimit ?? detail.pickTimeSeconds) },
    { label: "Auction Budget", value: toDraftState(detail.auctionBudget) },
    { label: "Draft Date", value: dateValue ?? "N/A" },
  ].filter((item) => item.value !== "N/A");

  if (curated.length > 0) return curated;

  return flattenDraftDetail(draftDetail)
    .filter((entry) => toDraftState(entry.value) !== "N/A")
    .slice(0, 12)
    .map((entry) => ({
      label: normalizeDraftLabel(entry.key),
      value: toDraftState(entry.value),
    }));
};

const buildDraftBoard = (draftDetail?: Record<string, unknown>): DraftPick[] => {
  if (!draftDetail || typeof draftDetail !== "object") return [];

  const picks = (draftDetail as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return [];

  return picks
    .filter((pick): pick is DraftPick => typeof pick === "object" && pick !== null)
    .sort((a, b) => (a.overallPickNumber ?? 0) - (b.overallPickNumber ?? 0));
};

const parseScoringRules = (scoringSettings: Record<string, unknown>): ScoringRule[] => {
  const scoringItems = (scoringSettings as { scoringItems?: { statId?: number; points?: number }[] }).scoringItems;
  if (Array.isArray(scoringItems) && scoringItems.length > 0) {
    return scoringItems
      .filter(
        (item): item is { statId: number; points: number } =>
          typeof item?.statId === "number" && typeof item?.points === "number"
      )
      .filter((rule) => rule.points !== 0);
  }

  // Backward compatibility for older payloads that stored a statId -> points map.
  return Object.entries(scoringSettings)
    .filter(([key, value]) => /^\d+$/.test(key) && typeof value === "number" && value !== 0)
    .map(([key, value]) => ({ statId: Number(key), points: value as number }));
};

const SectionTitle = ({
  icon,
  title,
  toneClassName,
}: {
  icon: ReactNode;
  title: string;
  toneClassName: string;
}) => (
  <div className="flex items-center gap-3">
    <div className={cn("flex size-8 items-center justify-center rounded-lg", toneClassName)}>{icon}</div>
    <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
  </div>
);

const EmptySection = ({ message }: { message: string }) => (
  <p className="text-sm text-muted-foreground">{message}</p>
);

export const LeagueOverview = ({ league, activeTeamId }: LeagueOverviewProps) => {
  const teams = useMemo(() => (Array.isArray(league.teams) ? (league.teams as Team[]) : []), [league.teams]);
  const activeScoringRules = useMemo(
    () => parseScoringRules((league.scoring_settings ?? {}) as Record<string, unknown>),
    [league.scoring_settings]
  );
  const draftSummary = useMemo(() => buildDraftSummary(league.draft_detail), [league.draft_detail]);
  const draftBoard = useMemo(() => buildDraftBoard(league.draft_detail), [league.draft_detail]);
  const teamNameById = useMemo(
    () => new Map(teams.map((team) => [Number(team.id), team.name || team.manager])),
    [teams]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-10 p-6 lg:p-10">
      <header className="flex flex-col items-start justify-between gap-6 border-b pb-8 md:flex-row md:items-center">
        <div className="space-y-1">
          <h1 className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            {league.name}
          </h1>
          <p className="text-lg font-medium text-muted-foreground">Season {league.season_id} Intel</p>
        </div>
        <Badge variant="secondary" className="border px-6 py-2 text-sm shadow-sm">
          {teams.length} Managers Active
        </Badge>
      </header>

      <section className="space-y-4">
        <SectionTitle
          icon={<Activity className="size-5" />}
          title="Scoring Matrix (H2H Points)"
          toneClassName="bg-primary/10 text-primary"
        />
        <Card className="border-border/50 bg-card/30 shadow-inner">
          <CardContent className="pt-6">
            {activeScoringRules.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {activeScoringRules.map((rule) => (
                    <div
                      key={rule.statId}
                      className="group flex items-center justify-between rounded-xl border border-border/40 bg-background/50 p-3.5 shadow-sm transition-colors hover:border-primary/20"
                    >
                      <span className="text-sm font-semibold transition-colors group-hover:text-primary">
                        {getStatName(rule.statId)}
                      </span>
                      <Badge variant={rule.points > 0 ? "default" : "destructive"} className="font-mono">
                        {rule.points > 0 ? "+" : ""}
                        {rule.points}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-2 pl-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  <span className="size-1 rounded-full bg-primary" />
                  ESPN Internal Mappings Active
                </div>
              </>
            ) : (
              <EmptySection message="No non-zero scoring rules were found in league settings." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle
          icon={<Users className="size-5" />}
          title="Intelligence Report: Teams"
          toneClassName="bg-blue-500/10 text-blue-500"
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const isActiveTeam = activeTeamId !== null && String(team.id) === String(activeTeamId);
            return (
              <Card
                key={team.id}
                className={cn(
                  "group overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
                  isActiveTeam ? "ring-2 ring-primary shadow-lg" : ""
                )}
              >
                <CardHeader
                  className={cn(
                    "flex flex-row items-center gap-4 border-b bg-muted/20 pb-4",
                    isActiveTeam ? "bg-primary/5" : ""
                  )}
                >
                  <Avatar className="size-12 border-2 border-background shadow-md">
                    <AvatarImage src={team.logo} alt={team.abbrev} />
                    <AvatarFallback className="font-bold">{team.abbrev?.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold transition-colors group-hover:text-primary">
                        {team.name}
                      </CardTitle>
                      {isActiveTeam ? <Badge className="h-4 text-[8px]">ACTIVE</Badge> : null}
                    </div>
                    <CardDescription className="text-xs font-medium uppercase tracking-wider">
                      {team.manager}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-around">
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-primary">{team.wins ?? 0}</span>
                      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Wins
                      </span>
                    </div>
                    <div className="h-10 w-px bg-border/50" />
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-muted-foreground/60">{team.losses ?? 0}</span>
                      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Losses
                      </span>
                    </div>
                    <div className="h-10 w-px bg-border/50" />
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-muted-foreground/40">{team.ties ?? 0}</span>
                      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Ties
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle
          icon={<CalendarClock className="size-5" />}
          title="Full Draft Board"
          toneClassName="bg-orange-500/10 text-orange-500"
        />
        <Card className="border-border/50 bg-card/30 shadow-inner">
          <CardContent className="pt-6">
            {draftBoard.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {draftBoard.length} picks synced from ESPN draft detail
                </p>
                <div className="max-h-[460px] overflow-auto rounded-xl border border-border/50">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                      <tr className="border-b border-border/60">
                        <th className="px-3 py-2 text-left font-semibold">Overall</th>
                        <th className="px-3 py-2 text-left font-semibold">Round</th>
                        <th className="px-3 py-2 text-left font-semibold">Pick</th>
                        <th className="px-3 py-2 text-left font-semibold">Team</th>
                        <th className="px-3 py-2 text-left font-semibold">Player</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftBoard.map((pick) => (
                        <tr
                          key={pick.id ?? `${pick.overallPickNumber}-${pick.playerId}`}
                          className="border-b border-border/40"
                        >
                          <td className="px-3 py-2 font-medium">{pick.overallPickNumber ?? "-"}</td>
                          <td className="px-3 py-2">{pick.roundId ?? "-"}</td>
                          <td className="px-3 py-2">{pick.roundPickNumber ?? "-"}</td>
                          <td className="px-3 py-2">
                            {pick.teamId !== undefined
                              ? (teamNameById.get(Number(pick.teamId)) ?? `Team ${pick.teamId}`)
                              : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium">{pick.playerName || `Player ${pick.playerId ?? "-"}`}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptySection message="Full draft picks are not available in the synced league payload." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
