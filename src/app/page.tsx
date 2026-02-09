"use client";

import { useEffect, useState } from "react";
import { getLatestNews } from "@/services/news.service";
import { MainLayout } from "@/components/layout/main-layout";
import { usePerspective } from "@/lib/perspective-context";
import { getLatestTransactions, fetchAndSyncTransactions } from "@/services/transaction.service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StandingsCard } from "@/components/dashboard/standings-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { IntelligenceFeed } from "@/components/dashboard/intelligence-feed";
import { NewsItem, TransactionItem, Team } from "@/types/dashboard";


// Mock schedule data temporarily removed for realism audit

export default function Home() {
  const { activeLeague, activeLeagueId, activeTeamId, isLoading: contextLoading } = usePerspective();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    getLatestNews(10).then(data => setNews(data as NewsItem[]));
  }, []);

  useEffect(() => {
    if (activeLeagueId) {
       getLatestTransactions(activeLeagueId, 10).then(data => setTransactions(data as any));
    }
  }, [activeLeagueId]);

  const handleSync = async () => {
    if (!activeLeagueId) return;
    setIsSyncing(true);
    try {
        const year = new Date().getFullYear().toString();
        const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "ffl";
        await fetchAndSyncTransactions(activeLeagueId, year, sport);
        const latestTx = await getLatestTransactions(activeLeagueId, 10);
        setTransactions(latestTx as any);
        // Refresh news as well if needed
        const latestNews = await getLatestNews(10);
        setNews(latestNews as NewsItem[]);
        console.log("Sync successful");
    } catch (error) {
        console.error("Sync failed:", error);
    } finally {
        setIsSyncing(false);
    }
  };

  if (contextLoading) {
    return (
        <MainLayout>
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground font-medium">Synchronizing Perspective...</p>
                </div>
            </div>
        </MainLayout>
    );
  }

  const league = activeLeague || {
    name: "Demo League",
    season_id: "2025",
    teams: []
  };

  const teams = (league.teams as Team[]) || [];

  return (
    <MainLayout>
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <DashboardHeader 
          leagueName={league.name || "No League"}
          seasonId={league.season_id || "2025"}
          isSyncing={isSyncing}
          onSync={handleSync}
          activeLeagueId={activeLeagueId}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
            
            {/* Top Grid: Stats & News */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
              
              {/* Left Column: Tables stacked */}
              <div className="xl:col-span-2 space-y-6">
                <StandingsCard 
                  teams={teams}
                  activeTeamId={activeTeamId}
                  mode="full"
                  title="Standings"
                />
                
                <ActivityFeed transactions={transactions} />
              </div>

              {/* Right Column: Intel Feed (Extended) */}
              <div className="h-full">
                <IntelligenceFeed news={news} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
