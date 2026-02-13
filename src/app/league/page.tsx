"use client";

import { usePerspective } from "@/lib/perspective-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Activity, CalendarClock, Users } from "lucide-react";
import { getStatName } from "@/lib/espn/constants";
import { MainLayout } from "@/components/layout/main-layout";
import { cn } from "@/lib/utils";
import { Team } from "@/lib/perspective-context";

type DraftValue = string | number | boolean | null | undefined;

const toDraftState = (value: DraftValue) => {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (value === null || value === undefined || value === "") return "N/A";
    return String(value);
};

const toDraftDate = (value: DraftValue) => {
    if (value === null || value === undefined || value === "") return null;
    const raw = Number(value);
    const timestamp =
        Number.isFinite(raw)
            ? (raw > 1_000_000_000_000 ? raw : raw * 1000)
            : (typeof value === "string" ? value : null);
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

const buildDraftSummary = (draftDetail?: Record<string, unknown>) => {
    if (!draftDetail || typeof draftDetail !== "object") return [];

    const detail = draftDetail as Record<string, DraftValue>;
    const dateValue =
        toDraftDate(detail.draftDate) ||
        toDraftDate(detail.date) ||
        toDraftDate(detail.draftTime) ||
        toDraftDate(detail.scheduledDate);

    return [
        { label: "Type", value: toDraftState(detail.type ?? detail.draftType ?? detail.format) },
        { label: "Status", value: toDraftState(detail.status ?? detail.state ?? detail.inProgress) },
        { label: "Rounds", value: toDraftState(detail.rounds ?? detail.totalRounds) },
        { label: "Pick Time", value: toDraftState(detail.pickTimeLimit ?? detail.pickTimeSeconds) },
        { label: "Auction Budget", value: toDraftState(detail.auctionBudget) },
        { label: "Draft Date", value: dateValue ?? "N/A" },
    ].filter((item) => item.value !== "N/A");
};

export default function LeaguePage() {
    const { activeTeam, activeLeague, isLoading, error } = usePerspective();

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground animate-pulse">Loading League Intel...</p>
                </div>
            </MainLayout>
        );
    }

    if (error) {
        return (
            <MainLayout>
                <div className="flex items-center justify-center h-full">
                    <div className="text-center p-8 border border-destructive/20 rounded-2xl bg-destructive/5 max-w-md">
                        <h1 className="text-2xl font-bold mb-2 text-destructive">Error Loading League</h1>
                        <p className="text-muted-foreground mb-4">{error}</p>
                        <Button onClick={() => window.location.reload()}>Retry Connection</Button>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const league = activeLeague;

    if (!league) {
        return (
            <MainLayout>
                <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold mb-2">League Not Found</h1>
                        <p className="text-muted-foreground">Please sync your league first.</p>
                    </div>
                </div>
            </MainLayout>
        );
    }

    // Safely destructure after the check
    const { name, season_id, scoring_settings, teams, draft_detail } = league;
    
    // Calculate total points stats count
    const scoringItems = (scoring_settings as unknown as { scoringItems: { statId: number; points: number }[] })?.scoringItems || [];
    
    // Filter out items with 0 points
    const activeScoringRules = scoringItems.filter((rule) => rule.points !== 0);
    const draftSummary = buildDraftSummary(draft_detail);

    return (
        <MainLayout>
            <div className="p-6 lg:p-10 space-y-10 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-extrabold tracking-tight bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">{name}</h1>
                        <p className="text-muted-foreground text-lg font-medium">Season {season_id} Intel</p>
                    </div>
                    <Badge variant="secondary" className="text-sm px-6 py-2 border shadow-sm">
                       {teams?.length || 0} Managers Active
                    </Badge>
                </div>

                {/* Draft Details */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                            <CalendarClock className="w-5 h-5" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">Draft Details</h2>
                    </div>
                    <Card className="border-border/50 bg-card/30 shadow-inner">
                        <CardContent className="pt-6">
                            {draftSummary.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {draftSummary.map((item) => (
                                        <div
                                            key={item.label}
                                            className="rounded-xl border border-border/40 bg-background/50 p-4"
                                        >
                                            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                                                {item.label}
                                            </p>
                                            <p className="mt-1 text-sm font-bold text-foreground">{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Draft data has not been synced yet for this league.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </section>

                {/* Scoring Settings */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Activity className="w-5 h-5" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">Scoring Matrix (H2H Points)</h2>
                    </div>
                    <Card className="border-border/50 bg-card/30 shadow-inner">
                        <CardContent className="pt-6">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {activeScoringRules.map((rule, index: number) => (
                                    <div key={index} className="flex justify-between items-center p-3.5 bg-background/50 rounded-xl border border-border/40 shadow-sm hover:border-primary/20 transition-colors group">
                                        <span className="font-semibold text-sm group-hover:text-primary transition-colors">{getStatName(rule.statId)}</span>
                                        <Badge variant={rule.points > 0 ? "default" : "destructive"} className="font-mono">
                                            {rule.points > 0 ? "+" : ""}{rule.points}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 mt-6 text-[10px] text-muted-foreground font-medium uppercase tracking-widest pl-1">
                                <span className="w-1 h-1 rounded-full bg-primary" />
                                ESPN Internal Mappings Active
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Teams Grid */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Users className="w-5 h-5" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">Intelligence Report: Teams</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(teams as Team[] || []).map((team) => (
                            <Card key={team.id} className={cn(
                                "hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 group overflow-hidden",
                                activeTeam?.id === team.id ? "ring-2 ring-primary shadow-lg" : ""
                            )}>
                                <CardHeader className={cn(
                                    "flex flex-row items-center gap-4 pb-4 border-b bg-muted/20",
                                    activeTeam?.id === team.id ? "bg-primary/5" : ""
                                )}>
                                    <Avatar className="h-12 w-12 border-2 border-background shadow-md">
                                        <AvatarImage src={team.logo} alt={team.abbrev} />
                                        <AvatarFallback className="font-bold">{team.abbrev?.substring(0, 2)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{team.name}</CardTitle>
                                            {activeTeam?.id === team.id && <Badge className="text-[8px] h-4">ACTIVE</Badge>}
                                        </div>
                                        <CardDescription className="text-xs font-medium uppercase tracking-wider">{team.manager}</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <div className="flex justify-around items-center">
                                        <div className="flex flex-col items-center">
                                            <span className="text-3xl font-black text-primary">{team.wins}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Wins</span>
                                        </div>
                                        <div className="w-px h-10 bg-border/50" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-3xl font-black text-muted-foreground/60">{team.losses}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Losses</span>
                                        </div>
                                         <div className="w-px h-10 bg-border/50" />
                                         <div className="flex flex-col items-center">
                                            <span className="text-3xl font-black text-muted-foreground/40">{team.ties ?? 0}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Ties</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>
            </div>
        </MainLayout>
    );
}

