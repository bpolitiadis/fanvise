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
  const [isLeagueSyncing, setIsLeagueSyncing] = useState(false);
  const [isNewsSyncing, setIsNewsSyncing] = useState(false);
  const [lastNewsSyncAt, setLastNewsSyncAt] = useState<string | null>(null);

  useEffect(() => {
    getLatestNews(10).then(data => setNews(data as NewsItem[]));
  }, []);

  useEffect(() => {
    if (!activeLeagueId) return;

    // Show cached DB data immediately for a fast first render
    getLatestTransactions(activeLeagueId, 10).then(data =>
      setTransactions(data as TransactionItem[])
    );

    // Then sync fresh data from ESPN in the background so the feed stays current
    const year = new Date().getFullYear().toString();
    const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
    fetchAndSyncTransactions(activeLeagueId, year, sport)
      .then(() => getLatestTransactions(activeLeagueId, 10))
      .then(data => setTransactions(data as TransactionItem[]))
      .catch(err => console.error("[Dashboard] Background transaction sync failed:", err));
  }, [activeLeagueId]);

  const handleLeagueSync = async () => {
    if (!activeLeagueId) return;
    setIsLeagueSyncing(true);
    try {
        const leagueSyncResponse = await fetch('/api/sync', { method: 'POST' });
        if (!leagueSyncResponse.ok) {
          throw new Error("League sync failed");
        }

        const year = new Date().getFullYear().toString();
        const sport = process.env.NEXT_PUBLIC_ESPN_SPORT || "fba";
        
        await fetchAndSyncTransactions(activeLeagueId, year, sport);
        const latestTx = await getLatestTransactions(activeLeagueId, 10);
        setTransactions(latestTx as TransactionItem[]);

        const playerStatusResponse = await fetch('/api/sync/player-status', {
          method: 'POST'
        });
        if (!playerStatusResponse.ok) {
          throw new Error("Player status sync failed");
        }

        const leadersSyncResponse = await fetch('/api/sync/daily-leaders', {
          method: 'POST'
        });
        if (!leadersSyncResponse.ok) {
          throw new Error("Daily leaders sync failed");
        }

        console.log("League sync successful");
    } catch (error) {
        console.error("League sync failed:", error);
    } finally {
        setIsLeagueSyncing(false);
    }
  };

  const handleNewsSync = async () => {
    if (!activeLeagueId) return;
    setIsNewsSyncing(true);
    try {
      console.log("[Dashboard] Triggering News Sync...");
      const newsSyncResponse = await fetch('/api/news/sync', {
        method: 'POST',
        body: JSON.stringify({ leagueId: activeLeagueId, teamId: activeTeamId }),
        headers: {
          'Content-Type': 'application/json',
          'x-fanvise-sync-intent': 'manual-news-sync',
        }
      });

      if (!newsSyncResponse.ok) {
        throw new Error("News sync failed");
      }

      const newsSyncResult = await newsSyncResponse.json();
      console.log(`[Dashboard] News Sync complete: ${newsSyncResult.count} items imported`);
      setLastNewsSyncAt(new Date().toISOString());

      const latestNews = await getLatestNews(15);
      setNews(latestNews as NewsItem[]);
    } catch (error) {
      console.error("News sync failed:", error);
    } finally {
      setIsNewsSyncing(false);
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
          isLeagueSyncing={isLeagueSyncing}
          isNewsSyncing={isNewsSyncing}
          onLeagueSync={handleLeagueSync}
          onNewsSync={handleNewsSync}
          lastNewsSyncAt={lastNewsSyncAt}
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
