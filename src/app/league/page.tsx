"use client";

import { usePerspective } from "@/lib/perspective-context";
import { Button } from "@/components/ui/button";
import { MainLayout } from "@/components/layout/main-layout";
import { LeagueOverview } from "@/components/league/league-overview";

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

    return (
        <MainLayout>
            <LeagueOverview league={league} activeTeamId={activeTeam?.id ?? null} />
        </MainLayout>
    );
}

