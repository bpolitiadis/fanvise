"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BarChart2 } from "lucide-react";
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
  title = "Standings",
  className,
}: StandingsCardProps) {
  const sortedTeams = [...teams].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  const displayTeams = mode === "summary" ? sortedTeams.slice(0, 5) : sortedTeams;

  return (
    <Card className={cn("bg-card/50 border-border/50 shadow-sm", className)}>
      <CardHeader className="pt-4 pb-3 px-4 border-b border-border/50 bg-muted/20">
        <CardTitle className="text-xs flex items-center justify-between uppercase tracking-widest font-semibold text-muted-foreground">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
            {title}
          </div>
          {mode === "full" && (
            <span className="text-[9px] font-bold lowercase tracking-wider text-muted-foreground/50">
              {displayTeams.length} teams
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {displayTeams.map((team, i) => {
            const isActive = String(team.id) === activeTeamId;
            return (
              <div
                key={team.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 transition-colors",
                  isActive
                    ? "bg-primary/5"
                    : "hover:bg-muted/30"
                )}
              >
                {/* Rank */}
                <span
                  className={cn(
                    "w-5 shrink-0 text-[11px] font-bold tabular-nums text-right",
                    isActive ? "text-primary" : "text-muted-foreground/40"
                  )}
                >
                  {i + 1}
                </span>

                {/* Avatar */}
                <Avatar
                  className={cn(
                    "h-7 w-7 shrink-0 border",
                    isActive ? "border-primary/40" : "border-border/60"
                  )}
                >
                  <AvatarImage src={team.logo} />
                  <AvatarFallback className="text-[10px] font-bold bg-muted/40">
                    {team.abbrev?.[0]}
                  </AvatarFallback>
                </Avatar>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-[13px] font-semibold truncate",
                        isActive ? "text-primary" : "text-foreground"
                      )}
                    >
                      {team.name}
                    </span>
                    {isActive && (
                      <Badge
                        variant="outline"
                        className="h-3.5 px-1 text-[8px] font-bold border-primary/30 text-primary bg-primary/5 shrink-0"
                      >
                        You
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 truncate block">
                    {team.manager}
                  </span>
                </div>

                {/* Record */}
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      "text-[13px] font-bold tabular-nums",
                      isActive ? "text-primary" : "text-foreground"
                    )}
                  >
                    {team.wins}-{team.losses}
                  </span>
                  {team.ties !== undefined && team.ties > 0 && (
                    <span className="block text-[9px] text-muted-foreground/50">
                      {team.ties}T
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {displayTeams.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <p className="text-xs text-muted-foreground">No standings data</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
