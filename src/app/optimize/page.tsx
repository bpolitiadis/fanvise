"use client";

import { usePerspective } from "@/lib/perspective-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Flame, Gem, TrendingUp, Calendar, ArrowRight, Filter, AlertCircle, Users } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Team } from "@/lib/perspective-context";
import { cn } from "@/lib/utils";


// Mock Recommendations
const MOCK_RECOMMENDATIONS = [
  {
    id: 1,
    type: "STREAM",
    player: { name: "T.J. McConnell", team: "IND", position: "PG" },
    reasoning: "Haliburton is GTD. IND plays 4 games in 5 nights.",
    metric: "+12.5 FPts",
    confidence: "HIGH",
    action: "PICKUP"
  },
  {
    id: 2,
    type: "HOLD",
    player: { name: "Tari Eason", team: "HOU", position: "SF/PF" },
    reasoning: "Minutes trending up (25 -> 32). Jabari Smith Jr. in foul trouble often.",
    metric: "High Upside",
    confidence: "MED",
    action: "STASH"
  },
  {
    id: 3,
    type: "STREAM",
    player: { name: "Kelly Olynyk", team: "TOR", position: "C" },
    reasoning: "Poeltl out. High assist potential for a big.",
    metric: "+8.2 FPts",
    confidence: "HIGH",
    action: "PICKUP"
  }
];

export default function OptimizePage() {
  const { activeTeam, activeLeague, isLoading } = usePerspective();

  const league = activeLeague || {
    name: "Demo League",
    teams: []
  };

  if (isLoading) {
    return (
        <MainLayout>
            <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground animate-pulse">Analyzing Rosters...</p>
            </div>
        </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 lg:p-10 space-y-8 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
              <div>
                  <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
                      <TrendingUp className="w-8 h-8 text-primary" />
                      Optimize Lineup
                  </h1>
                  <p className="text-muted-foreground mt-2 text-lg">
                      AI-driven waiver wire analysis & streaming recommendations.
                  </p>
              </div>
              <div className="flex gap-2">
                  <Button variant="outline" className="gap-2">
                      <Calendar className="w-4 h-4" />
                      Rest of Week
                  </Button>
                  <Button className="gap-2 shadow-lg shadow-primary/20">
                      Run Simulation
                      <ArrowRight className="w-4 h-4" />
                  </Button>
              </div>
          </div>

          {/* Controls / Inputs (Mock) */}
          <Card className="bg-muted/30 border-none shadow-inner">
              <CardContent className="py-4 flex items-center gap-4 overflow-x-auto">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground whitespace-nowrap">
                      <Filter className="w-4 h-4" />
                      Filters:
                  </div>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 bg-background/50">
                      Pos: All
                  </Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 bg-background/50">
                      Max Adds: 3
                  </Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 bg-background/50">
                      Strategy: Win Now
                  </Badge>
              </CardContent>
          </Card>

          {/* Recommendations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Column 1: Pure Streams */}
              <div className="space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b">
                      <Flame className="w-5 h-5 text-orange-500" />
                      <h2 className="text-xl font-bold">Pure Streams</h2>
                      <Badge variant="outline" className="ml-auto text-orange-500 border-orange-500/20 bg-orange-500/10">
                          Volume Plays
                      </Badge>
                  </div>
                  
                  {MOCK_RECOMMENDATIONS.filter(r => r.type === "STREAM").map(rec => (
                      <Card key={rec.id} className="hover:border-primary/50 transition-all group overflow-hidden border-border/50 shadow-sm hover:shadow-md">
                          <CardHeader className="pb-3 flex flex-row items-center gap-4">
                              <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                      {rec.player.name.charAt(0)}
                                  </AvatarFallback>
                              </Avatar>
                              <div className="space-y-1">
                                  <CardTitle className="text-lg leading-none">{rec.player.name}</CardTitle>
                                  <CardDescription className="flex items-center gap-2">
                                      <span>{rec.player.team}</span>
                                      <span>•</span>
                                      <span>{rec.player.position}</span>
                                  </CardDescription>
                              </div>
                              <div className="ml-auto text-right">
                                  <div className="text-xl font-bold text-green-500">{rec.metric}</div>
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Proj. Gain</div>
                              </div>
                          </CardHeader>
                          <CardContent>
                              <div className="p-3 bg-muted/30 rounded-lg text-sm border-none flex gap-3 items-start shadow-inner">
                                  <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                  <span className="text-muted-foreground leading-relaxed italic">&ldquo;{rec.reasoning}&rdquo;</span>
                              </div>
                          </CardContent>
                          <CardFooter className="pt-0 pb-4">
                              <Button className="w-full gap-2 group-hover:bg-primary transition-all font-bold" size="sm">
                                  {rec.action} PLAYER
                                  <ArrowRight className="w-4 h-4" />
                              </Button>
                          </CardFooter>
                      </Card>
                  ))}
              </div>

              {/* Column 2: Speculative Holds */}
              <div className="space-y-6">
                   <div className="flex items-center gap-2 pb-2 border-b">
                      <Gem className="w-5 h-5 text-purple-500" />
                      <h2 className="text-xl font-bold">Speculative Holds</h2>
                       <Badge variant="outline" className="ml-auto text-purple-500 border-purple-500/20 bg-purple-500/10">
                          High Upside
                      </Badge>
                  </div>

                  {MOCK_RECOMMENDATIONS.filter(r => r.type === "HOLD").map(rec => (
                       <Card key={rec.id} className="hover:border-purple-500/50 transition-all border-border/50 shadow-sm hover:shadow-md overflow-hidden">
                          <CardHeader className="pb-3 flex flex-row items-center gap-4">
                              <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                                  <AvatarFallback className="bg-purple-500/10 text-purple-500 font-bold">
                                      {rec.player.name.charAt(0)}
                                  </AvatarFallback>
                              </Avatar>
                              <div className="space-y-1">
                                  <CardTitle className="text-lg leading-none">{rec.player.name}</CardTitle>
                                  <CardDescription className="flex items-center gap-2">
                                      <span>{rec.player.team}</span>
                                      <span>•</span>
                                      <span>{rec.player.position}</span>
                                  </CardDescription>
                              </div>
                              <div className="ml-auto text-right">
                                  <div className="text-xl font-bold text-purple-500">{rec.metric}</div>
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Potential</div>
                              </div>
                          </CardHeader>
                          <CardContent>
                              <div className="p-3 bg-muted/30 rounded-lg text-sm border-none flex gap-3 items-start shadow-inner">
                                  <TrendingUp className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                                  <span className="text-muted-foreground leading-relaxed italic">&ldquo;{rec.reasoning}&rdquo;</span>
                              </div>
                          </CardContent>
                          <CardFooter className="pt-0 pb-4">
                               <Button variant="secondary" className="w-full gap-2 font-bold" size="sm">
                                  {rec.action} PLAYER
                                  <ArrowRight className="w-4 h-4" />
                              </Button>
                          </CardFooter>
                      </Card>
                  ))}
              </div>
          </div>
                {/* Teams Grid */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Users className="w-5 h-5" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">Intelligence Report: Teams</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(league.teams as Team[] || []).map((team: Team) => (
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
                                            <span className="text-3xl font-black text-primary">{team.wins || 0}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Wins</span>
                                        </div>
                                        <div className="w-px h-10 bg-border/50" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-3xl font-black text-muted-foreground/60">{team.losses || 0}</span>
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
