"use client";

import { useEffect, useState } from "react";
import { getLatestNews } from "@/services/news.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Calendar, AlertTriangle, TrendingUp, MessageSquare, RefreshCw, ArrowRightLeft } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { usePerspective } from "@/lib/perspective-context";
import { getLatestTransactions, fetchAndSyncTransactions } from "@/services/transaction.service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NewsItem {
  id: string;
  url: string;
  title: string;
  summary?: string;
  content?: string;
  source: string;
  published_at: string;
}

export interface TransactionItem {
  id: string;
  type: string;
  description: string;
  published_at: string;
}

/** Team data structure for UI rendering */
export interface Team {
  id: string | number;
  name: string;
  abbrev: string;
  logo?: string;
  manager: string;
  is_user_owned?: boolean;
  wins?: number;
  losses?: number;
  ties?: number;
}


// Mock schedule data temporarily removed for realism audit

export default function Home() {
  const { activeLeague, activeLeagueId, isLoading: contextLoading } = usePerspective();
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
        {/* Header */}
        <header className="flex h-16 items-center border-b px-6 bg-background/50 backdrop-blur-md sticky top-0 z-10 justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">Intelligence Dashboard</h1>
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest text-primary border-primary/20 bg-primary/5">
                Week 12 Active
            </Badge>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4 border-r pr-4">
                 <span className="font-medium text-foreground">{league?.name || "No League"}</span>
                 <span>•</span>
                 <span>Season {league?.season_id || "2025"}</span>
             </div>
             <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 h-8" 
                onClick={handleSync}
                disabled={isSyncing || !activeLeagueId}
             >
                <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
                {isSyncing ? "Syncing..." : "Sync Intelligence"}
             </Button>
             <Avatar className="h-8 w-8 border">
                <AvatarFallback>U</AvatarFallback>
             </Avatar>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
            
            {/* Top Grid: Stats & News */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
              
              {/* Left Column: Heatmap & Leaders */}
              <div className="xl:col-span-2 space-y-8">
                
                
                {/* Dashboard Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-card/30 border-border/50">
                    <CardHeader className="pb-2 border-b bg-muted/20">
                      <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        Standings Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 px-4">
                      <div className="space-y-4">
                        {teams.sort((a,b) => (b.wins || 0) - (a.wins || 0)).slice(0, 5).map((team, i) => (
                          <div key={team.id} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-muted-foreground/40 w-4">0{i+1}</span>
                              <Avatar className="h-8 w-8 border">
                                <AvatarImage src={team.logo} />
                                <AvatarFallback>{team.abbrev?.[0]}</AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold group-hover:text-primary transition-colors">{team.name}</span>
                                <span className="text-[10px] text-muted-foreground">{team.manager}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-primary">{team.wins}-{team.losses}</span>
                            </div>
                          </div>
                        ))}
                        {teams.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No team data synced</p>}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-card/30 border-border/50">
                    <CardHeader className="pb-2 border-b bg-muted/20">
                      <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                        <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                        Recent Transactions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 px-4">
                      <div className="space-y-4">
                        {transactions.slice(0, 5).map((tx, i) => {
                          let badgeColor = "bg-muted text-muted-foreground";
                          let label = tx.type;
                          let Icon = Activity;

                          if (tx.type === 'FREEAGENT') {
                            badgeColor = "bg-green-500/10 text-green-500 border-green-500/20";
                            label = "FA Pickup";
                          } else if (tx.type === 'WAIVER') {
                            badgeColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                            label = "Waiver";
                          } else if (tx.type === 'TRADE') {
                            badgeColor = "bg-purple-500/10 text-purple-500 border-purple-500/20";
                            label = "Trade";
                          } else if (tx.type === 'ROSTER') {
                             badgeColor = "bg-teal-500/10 text-teal-500 border-teal-500/20";
                             label = "Add/Drop";
                             Icon = ArrowRightLeft;
                          }

                          return (
                            <div key={tx.id} className="flex items-center justify-between group py-1 border-b border-white/5 last:border-0 pb-2">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", badgeColor.split(' ')[0])}>
                                   <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-semibold truncate group-hover:text-primary transition-colors pr-2">{tx.description}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                        {new Date(tx.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(tx.published_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                              </div>
                              <Badge className={cn("text-[8px] font-bold uppercase tracking-tight h-5", badgeColor)} variant="outline">
                                {label}
                              </Badge>
                            </div>
                          )
                        })}
                        {transactions.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                             <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground/30">
                                <ArrowRightLeft className="w-6 h-6" />
                             </div>
                             <p className="text-xs text-muted-foreground">No recent activity detected</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Right Column: Intel Feed & Quick Chat */}
              <div className="space-y-8">
                
                {/* Intel Feed */}
                <Card className="border-border/50 shadow-lg bg-card/50 backdrop-blur-sm border-l-4 border-l-yellow-600">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <AlertTriangle className="w-5 h-5 text-yellow-600" />
                            Intelligence Feed
                        </CardTitle>
                        <Badge className="bg-yellow-600/10 text-yellow-600 border-yellow-600/20">Live</Badge>
                    </div>
                    <CardDescription>Recent injuries & roster implications</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                      <div className="p-4 space-y-4">
                        {news && news.length > 0 ? news.map((item: NewsItem) => (
                          <div key={item.id} className="relative pl-4 border-l-2 border-muted hover:border-yellow-600 transition-colors group py-1">
                            <div className="absolute -left-[5px] top-3 w-2 h-2 rounded-full bg-muted group-hover:bg-yellow-600 transition-colors" />
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="block space-y-1">
                              <h4 className="font-bold text-sm leading-tight group-hover:text-yellow-600 transition-colors line-clamp-2">
                                {item.title}
                              </h4>
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {item.summary || item.content}
                              </p>
                              <div className="flex items-center gap-2 pt-1 uppercase tracking-tighter text-[9px] font-bold text-muted-foreground/60">
                                <span>{item.source}</span>
                                <span>•</span>
                                <span>{new Date(item.published_at).toLocaleDateString()}</span>
                              </div>
                            </a>
                          </div>
                        )) : (
                          <div className="text-center py-12">
                            <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                            <p className="text-sm text-muted-foreground">Scanning for intel...</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Quick Chat Snippet */}
                <Card className="border-primary/20 shadow-xl bg-gradient-to-br from-primary/5 to-background border-t-4 border-primary overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-primary" />
                            Consult Coach
                        </CardTitle>
                        <CardDescription className="text-[10px]">Context-aware AI strategist</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="h-[200px] flex flex-col items-center justify-center p-6 text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary animate-pulse">
                                <Activity className="w-6 h-6" />
                            </div>
                            <p className="text-xs text-muted-foreground">Ask about who to drop, trades, or matchup advantages.</p>
                            <a href="/chat" className="w-full">
                                <button className="w-full h-9 bg-primary text-primary-foreground rounded-md text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
                                    Open Strategy Room
                                </button>
                            </a>
                        </div>
                    </CardContent>
                </Card>

              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
