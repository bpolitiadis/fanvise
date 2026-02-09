"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Team } from "@/types/dashboard";

interface StandingsCardProps {
  teams: Team[];
  activeTeamId?: string | null;
  mode?: "summary" | "full";
  title?: string;
  className?: string;
}

export function StandingsCard({
  teams,
  activeTeamId,
  mode = "summary",
  title = "Standings Summary",
  className,
}: StandingsCardProps) {
  const sortedTeams = [...teams].sort((a,b) => (b.wins || 0) - (a.wins || 0));
  const displayTeams = mode === "summary" ? sortedTeams.slice(0, 5) : sortedTeams;

  return (
    <Card className={cn("bg-card/30 border-border/50", className)}>
      <CardHeader className="pb-2 border-b bg-muted/20">
        <CardTitle className="text-sm flex items-center justify-between uppercase tracking-wider text-muted-foreground">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {title}
          </div>
          {mode === "full" && <span className="text-[10px] font-normal lowercase">All Teams</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 px-4">
        <div className="space-y-2">
          {displayTeams.map((team, i) => {
            const isActive = String(team.id) === activeTeamId;
            return (
              <div 
                key={team.id} 
                className={cn(
                  "flex items-center justify-between group p-2 rounded-lg transition-all",
                  isActive ? "bg-primary/10 border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-xs font-bold w-4",
                    isActive ? "text-primary" : "text-muted-foreground/40"
                  )}>
                    {String(i+1).padStart(2, '0')}
                  </span>
                  <Avatar className={cn("h-8 w-8 border", isActive && "border-primary/50")}>
                    <AvatarImage src={team.logo} />
                    <AvatarFallback>{team.abbrev?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-sm font-semibold transition-colors",
                      isActive ? "text-primary" : "group-hover:text-primary"
                    )}>
                      {team.name}
                      {isActive && <Badge variant="outline" className="ml-2 py-0 h-4 text-[8px] border-primary/30 text-primary">Selected</Badge>}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{team.manager}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <span className={cn("font-mono font-bold", isActive ? "text-primary" : "text-foreground")}>
                            {team.wins}-{team.losses}
                        </span>
                        {team.ties !== undefined && team.ties > 0 && (
                          <span className="text-[9px] text-muted-foreground">{team.ties} ties</span>
                        )}
                    </div>
                </div>
              </div>
            );
          })}
          {displayTeams.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No team data synced</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
