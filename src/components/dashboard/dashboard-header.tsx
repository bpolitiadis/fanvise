"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  leagueName: string;
  seasonId: string;
  isLeagueSyncing: boolean;
  isNewsSyncing: boolean;
  onLeagueSync: () => void;
  onNewsSync: () => void;
  lastNewsSyncAt: string | null;
  activeLeagueId?: string | null;
}

export function DashboardHeader({
  leagueName,
  seasonId,
  isLeagueSyncing,
  isNewsSyncing,
  onLeagueSync,
  onNewsSync,
  lastNewsSyncAt,
  activeLeagueId,
}: DashboardHeaderProps) {
  const lastNewsSyncLabel = lastNewsSyncAt
    ? `Last news sync: ${new Date(lastNewsSyncAt).toLocaleString()}`
    : "Last news sync: Not synced in this session";

  return (
    <header className="flex min-h-16 items-center border-b px-6 py-2 bg-background/50 backdrop-blur-md sticky top-0 z-10 justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
            <Image 
              src="/fanvise_logo.png" 
              alt="FanVise Mark" 
              width={16} 
              height={16}
              className="object-contain"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Intelligence Dashboard</h1>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest text-primary border-primary/20 bg-primary/5">
            Week 12 Active
        </Badge>
      </div>
      <div className="flex items-center gap-3">
         <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4 border-r pr-4">
             <span className="font-medium text-foreground">{leagueName || "No League"}</span>
             <span>•</span>
             <span>Season {seasonId || "2025"}</span>
         </div>
         <Button
            variant="outline"
            size="sm"
            className="gap-2 h-8 font-bold text-[11px] uppercase tracking-wider"
            onClick={onLeagueSync}
            disabled={isLeagueSyncing || !activeLeagueId}
         >
            <RefreshCw className={cn("h-3.5 w-3.5", isLeagueSyncing && "animate-spin")} />
            {isLeagueSyncing ? "Syncing..." : "Sync League"}
         </Button>
         <div className="flex flex-col items-end gap-0.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 font-bold text-[11px] uppercase tracking-wider"
              onClick={onNewsSync}
              disabled={isNewsSyncing || !activeLeagueId}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isNewsSyncing && "animate-spin")} />
              {isNewsSyncing ? "Syncing..." : "Sync News"}
            </Button>
            <span className="text-[10px] text-muted-foreground">{lastNewsSyncLabel}</span>
         </div>
         <Avatar className="h-8 w-8 border">
            <AvatarFallback>U</AvatarFallback>
         </Avatar>
      </div>
    </header>
  );
}
